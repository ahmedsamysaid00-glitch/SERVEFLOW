/*
# Cashier Dashboard: Shifts table + atomic order creation RPC

## 1. cashier_shifts table
Tracks cashier shift lifecycle: open with starting cash, close with
ending cash and calculated difference. Scoped to restaurant + branch +
cashier via RLS.

## 2. create_cashier_order RPC
A SECURITY DEFINER function that atomically creates an order with all
order_items. It validates:
  - The caller is an authenticated cashier
  - The cashier belongs to the restaurant and branch
  - Every cart item exists, belongs to the same restaurant, has a
    branch_menu_items record for the cashier's branch, and is available
  - Prices are read server-side from branch_menu_items (never trusted
    from the client)
  - Subtotal, tax, and total are computed server-side
  - The order's branch_id matches the cashier's assigned branch
  - cashier_id is set to the authenticated user (never from the client)

This prevents price tampering, branch spoofing, and ordering unavailable
items.
*/

-- ============================================================================
-- 1. cashier_shifts TABLE
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE shift_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id     uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cashier_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  starting_cash numeric(10,2) NOT NULL DEFAULT 0 CHECK (starting_cash >= 0),
  ending_cash   numeric(10,2) CHECK (ending_cash IS NULL OR ending_cash >= 0),
  expected_cash numeric(10,2) NOT NULL DEFAULT 0,
  cash_difference numeric(10,2) NOT NULL DEFAULT 0,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  status        shift_status NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_branch ON cashier_shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier ON cashier_shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_status ON cashier_shifts(status);

-- Only one open shift per cashier at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_cashier_shifts_one_open
  ON cashier_shifts(cashier_id)
  WHERE status = 'open';

-- ============================================================================
-- RLS for cashier_shifts
-- ============================================================================

ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;

-- Cashiers can see their own shifts; managers/owners can see all shifts in their branch
DROP POLICY IF EXISTS "select_cashier_shifts" ON cashier_shifts;
CREATE POLICY "select_cashier_shifts" ON cashier_shifts FOR SELECT
  TO authenticated
  USING (
    cashier_id = auth.uid()
    OR is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager']::member_role[])
  );

-- Only the cashier themselves can insert (open) a shift for their own branch
DROP POLICY IF EXISTS "insert_cashier_shifts" ON cashier_shifts;
CREATE POLICY "insert_cashier_shifts" ON cashier_shifts FOR INSERT
  TO authenticated
  WITH CHECK (
    cashier_id = auth.uid()
    AND is_branch_member(restaurant_id, branch_id, ARRAY['cashier']::member_role[])
  );

-- Only the cashier can update (close) their own shift
DROP POLICY IF EXISTS "update_cashier_shifts" ON cashier_shifts;
CREATE POLICY "update_cashier_shifts" ON cashier_shifts FOR UPDATE
  TO authenticated
  USING (cashier_id = auth.uid())
  WITH CHECK (cashier_id = auth.uid());

-- No deletes for cashiers
DROP POLICY IF EXISTS "delete_cashier_shifts" ON cashier_shifts;
CREATE POLICY "delete_cashier_shifts" ON cashier_shifts FOR DELETE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager']::member_role[]));

-- ============================================================================
-- 2. create_cashier_order RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION create_cashier_order(
  p_cart_items jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount numeric(10,2) DEFAULT 0,
  p_tax_rate numeric(5,4) DEFAULT 0,
  p_payment_method payment_method DEFAULT 'cash',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity int;
  v_unit_price numeric(10,2);
  v_item_subtotal numeric(10,2);
  v_branch_restaurant uuid;
  v_mi_restaurant uuid;
  v_count int := 0;
BEGIN
  -- 1. Validate authenticated user and cashier role
  SELECT rm.restaurant_id, rm.branch_id, b.restaurant_id AS branch_restaurant_id
    INTO v_member
  FROM restaurant_members rm
  JOIN branches b ON b.id = rm.branch_id
  WHERE rm.user_id = auth.uid()
    AND rm.role = 'cashier'
    AND rm.status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a cashier or not assigned to a branch';
  END IF;

  -- 2. Validate cart is not empty
  IF p_cart_items IS NULL OR jsonb_array_length(p_cart_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  -- 3. Validate discount
  IF p_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  -- 4. Validate customer belongs to this restaurant (if provided)
  IF p_customer_id IS NOT NULL THEN
    SELECT restaurant_id INTO v_branch_restaurant FROM customers WHERE id = p_customer_id;
    IF v_branch_restaurant IS NULL THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_branch_restaurant <> v_member.restaurant_id THEN
      RAISE EXCEPTION 'Customer does not belong to this restaurant';
    END IF;
  END IF;

  -- 5. Validate each cart item and compute subtotal
  FOR v_item IN SELECT jsonb_array_elements(p_cart_items) LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::uuid;
    v_quantity := (v_item->>'quantity')::int;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for item %', v_menu_item_id;
    END IF;

    -- Validate menu item belongs to this restaurant
    SELECT mi.restaurant_id INTO v_mi_restaurant
    FROM menu_items mi
    WHERE mi.id = v_menu_item_id;

    IF v_mi_restaurant IS NULL THEN
      RAISE EXCEPTION 'Menu item % not found', v_menu_item_id;
    END IF;

    IF v_mi_restaurant <> v_member.restaurant_id THEN
      RAISE EXCEPTION 'Menu item % does not belong to this restaurant', v_menu_item_id;
    END IF;

    -- Validate branch_menu_items: exists, available, belongs to cashier's branch
    SELECT bmi.price INTO v_unit_price
    FROM branch_menu_items bmi
    WHERE bmi.menu_item_id = v_menu_item_id
      AND bmi.branch_id = v_member.branch_id
      AND bmi.is_available = true;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Item % is not available at this branch', v_menu_item_id;
    END IF;

    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;
    v_count := v_count + 1;
  END LOOP;

  -- 6. Compute totals (server-side)
  IF p_discount > v_subtotal THEN
    RAISE EXCEPTION 'Discount cannot exceed subtotal';
  END IF;

  v_tax := ROUND((v_subtotal - p_discount) * p_tax_rate, 2);
  v_total := v_subtotal - p_discount + v_tax;

  -- 7. Create the order
  INSERT INTO orders (
    restaurant_id, branch_id, customer_id, cashier_id,
    status, subtotal, discount, tax, total,
    payment_status, payment_method, notes
  ) VALUES (
    v_member.restaurant_id,
    v_member.branch_id,
    p_customer_id,
    auth.uid(),
    'pending',
    v_subtotal,
    p_discount,
    v_tax,
    v_total,
    CASE WHEN p_payment_method IS NOT NULL THEN 'paid' ELSE 'unpaid' END,
    p_payment_method,
    p_notes
  )
  RETURNING id INTO v_order_id;

  -- 8. Create order_items using server-validated prices
  FOR v_item IN SELECT jsonb_array_elements(p_cart_items) LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::uuid;
    v_quantity := (v_item->>'quantity')::int;

    SELECT bmi.price INTO v_unit_price
    FROM branch_menu_items bmi
    WHERE bmi.menu_item_id = v_menu_item_id
      AND bmi.branch_id = v_member.branch_id;

    v_item_subtotal := v_unit_price * v_quantity;

    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal)
    VALUES (v_order_id, v_menu_item_id, v_quantity, v_unit_price, v_item_subtotal);
  END LOOP;

  -- 9. Return the created order
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', p_discount,
    'tax', v_tax,
    'total', v_total,
    'item_count', v_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_cashier_order(jsonb, uuid, numeric, numeric, payment_method, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_cashier_order(jsonb, uuid, numeric, numeric, payment_method, text) TO authenticated;
