/*
# Audit Fix: close_cashier_shift RPC + order lifecycle RLS correction

## 1. close_cashier_shift RPC
A SECURITY DEFINER function that atomically closes a cashier shift.
It computes expected_cash server-side from starting_cash + cash sales
(paid, non-cancelled orders by this cashier since shift opened).
This prevents the client from supplying a tampered expected_cash value.

## 2. Remove cashier from orders UPDATE RLS
The cashier should NOT be able to change order preparation status.
Only manager and kitchen can update order status. The cashier's
responsibility is order creation and payment recording, not lifecycle
management. Cashier order creation goes through the RPC, not through
direct INSERT on orders, so removing cashier from UPDATE is safe.
*/

-- ============================================================================
-- 1. close_cashier_shift RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION close_cashier_shift(
  p_shift_id uuid,
  p_ending_cash numeric(10,2)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift RECORD;
  v_cash_sales numeric(10,2) := 0;
  v_card_sales numeric(10,2) := 0;
  v_order_count int := 0;
  v_expected_cash numeric(10,2);
  v_cash_difference numeric(10,2);
BEGIN
  -- 1. Validate authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 2. Fetch the shift and verify ownership + status
  SELECT * INTO v_shift
  FROM cashier_shifts
  WHERE id = p_shift_id
    AND cashier_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift not found or not yours';
  END IF;

  IF v_shift.status = 'closed' THEN
    RAISE EXCEPTION 'Shift is already closed';
  END IF;

  -- 3. Validate ending cash
  IF p_ending_cash IS NULL OR p_ending_cash < 0 THEN
    RAISE EXCEPTION 'Ending cash must be a non-negative number';
  END IF;

  -- 4. Compute cash sales from paid, non-cancelled orders since shift opened
  SELECT
    COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN o.payment_method = 'card' THEN o.total ELSE 0 END), 0),
    COUNT(*)
  INTO v_cash_sales, v_card_sales, v_order_count
  FROM orders o
  WHERE o.cashier_id = auth.uid()
    AND o.branch_id = v_shift.branch_id
    AND o.restaurant_id = v_shift.restaurant_id
    AND o.created_at >= v_shift.opened_at
    AND o.payment_status = 'paid'
    AND o.status <> 'cancelled';

  -- 5. Calculate expected cash and difference
  -- expected_cash = starting_cash + cash_sales (card sales NOT included)
  v_expected_cash := v_shift.starting_cash + v_cash_sales;
  v_cash_difference := p_ending_cash - v_expected_cash;

  -- 6. Close the shift
  UPDATE cashier_shifts
  SET
    ending_cash = p_ending_cash,
    expected_cash = v_expected_cash,
    cash_difference = v_cash_difference,
    closed_at = now(),
    status = 'closed'
  WHERE id = p_shift_id
    AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift was closed by another session';
  END IF;

  -- 7. Return summary
  RETURN jsonb_build_object(
    'shift_id', p_shift_id,
    'expected_cash', v_expected_cash,
    'cash_difference', v_cash_difference,
    'cash_sales', v_cash_sales,
    'card_sales', v_card_sales,
    'order_count', v_order_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION close_cashier_shift(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION close_cashier_shift(uuid, numeric) TO authenticated;

-- ============================================================================
-- 2. Remove cashier from orders UPDATE RLS
-- Cashier should NOT update order status. Only manager + kitchen can.
-- ============================================================================

DROP POLICY IF EXISTS "update_orders" ON orders;
CREATE POLICY "update_orders" ON orders FOR UPDATE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['manager','kitchen']::member_role[]))
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['manager','kitchen']::member_role[]));
