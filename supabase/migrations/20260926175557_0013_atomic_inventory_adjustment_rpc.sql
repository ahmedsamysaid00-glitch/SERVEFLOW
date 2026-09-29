/*
# Audit fix: Atomic inventory adjustment RPC

The previous client-side adjustInventory performed a non-atomic
read-then-write:
  1. INSERT inventory_transactions
  2. SELECT current quantity from inventory_items
  3. Compute new quantity in JavaScript
  4. UPDATE inventory_items with new quantity

Under concurrent requests, two adjustments could read the same quantity
and overwrite each other, producing inconsistent state.

This RPC performs the entire operation atomically in a single transaction:
  - Validates the caller is an active manager or kitchen staff member
  - Validates the inventory item belongs to the caller's branch
  - Inserts the transaction record
  - Updates the inventory quantity using atomic delta arithmetic
  - Returns the new quantity

The caller's restaurant_id and branch_id are derived from auth.uid()
via restaurant_members — the client cannot choose another branch.
*/

CREATE OR REPLACE FUNCTION adjust_inventory(
  p_inventory_item_id uuid,
  p_type inventory_tx_type,
  p_quantity numeric,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_item RECORD;
  v_delta numeric;
  v_new_qty numeric;
BEGIN
  -- 1. Validate authenticated user and get membership
  SELECT rm.restaurant_id, rm.branch_id, rm.role
  INTO v_member
  FROM restaurant_members rm
  WHERE rm.user_id = auth.uid()
    AND rm.status = 'active'
    AND rm.role IN ('manager', 'kitchen');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized to adjust inventory';
  END IF;

  -- 2. Validate inventory item belongs to caller's branch
  SELECT id, quantity, restaurant_id, branch_id
  INTO v_item
  FROM inventory_items
  WHERE id = p_inventory_item_id
    AND restaurant_id = v_member.restaurant_id
    AND branch_id = v_member.branch_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found in your branch';
  END IF;

  -- 3. Validate quantity
  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity must be non-zero';
  END IF;

  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  -- 4. Compute delta based on transaction type
  v_delta := p_quantity;
  IF p_type IN ('consumption', 'waste', 'transfer_out') THEN
    v_delta := -p_quantity;
  END IF;

  -- 5. Insert transaction record
  INSERT INTO inventory_transactions (
    restaurant_id, branch_id, inventory_item_id,
    type, quantity, reason, created_by
  ) VALUES (
    v_member.restaurant_id,
    v_member.branch_id,
    p_inventory_item_id,
    p_type,
    p_quantity,
    p_reason,
    auth.uid()
  );

  -- 6. Atomically update inventory quantity (clamp at 0)
  UPDATE inventory_items
    SET quantity = GREATEST(0, quantity + v_delta)
    WHERE id = p_inventory_item_id
    AND restaurant_id = v_member.restaurant_id
    AND branch_id = v_member.branch_id
  RETURNING quantity INTO v_new_qty;

  -- 7. Return result
  RETURN jsonb_build_object(
    'inventory_item_id', p_inventory_item_id,
    'new_quantity', v_new_qty
  );
END;
$$;

-- Permissions: only authenticated, not anon, not PUBLIC
REVOKE EXECUTE ON FUNCTION adjust_inventory(uuid, inventory_tx_type, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION adjust_inventory(uuid, inventory_tx_type, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adjust_inventory(uuid, inventory_tx_type, numeric, text) TO authenticated;
