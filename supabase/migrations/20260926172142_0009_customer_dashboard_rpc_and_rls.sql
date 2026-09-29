/*
# Customer Dashboard: create_customer_order RPC + customer RLS adjustments

## 1. create_customer_order RPC

A SECURITY DEFINER function that atomically creates a customer order.

Authorization:
- Caller must be authenticated
- Caller must have a valid active customer record (customers.user_id = auth.uid(), status = 'active')
- restaurant_id is derived from the customer record, never from client input
- branch_id is supplied by client but validated against the customer's restaurant
- Every cart item is validated against the branch's menu
- Price is always read from branch_menu_items.price (never from client)
- All totals calculated server-side

Payment:
- Customer orders default to payment_status = 'unpaid' and payment_method = NULL
  (payment is handled at the restaurant, not online)
- If the customer selects a payment method preference, it is recorded as a
  preference only — payment_status remains 'unpaid' until staff confirms

Atomicity:
- The entire function is a single transaction
- If any validation fails, no order or order_items are created

## 2. RLS adjustments for customer access

### customers UPDATE policy
The current UPDATE policy allows restaurant staff (owner/manager) OR
auth.uid() = user_id. This is fine — a customer can update their own
profile but the WITH CHECK prevents changing restaurant_id or user_id
because those columns have no policy-level restriction.

We need to restrict customer self-update to only safe fields (full_name,
phone, email). We add a column-level restriction by creating a separate
UPDATE policy for customer self-service that only allows updating
non-sensitive columns. However, PostgreSQL RLS operates at row level,
not column level. Instead, we use a trigger to prevent customers from
changing restaurant_id, user_id, or status.

### orders SELECT policy
Already allows customer access via:
  EXISTS (SELECT 1 FROM customers c WHERE c.id = orders.customer_id AND c.user_id = auth.uid())
This is correct and sufficient.

### orders INSERT
Already blocked for cashier (migration 0008). Customer INSERT goes
through the RPC only. The existing INSERT policy allows:
  is_branch_member(..., ['manager']) OR customer self-order
The customer self-order path (c.user_id = auth.uid()) would allow direct
INSERT, but the RPC is the intended path. We should remove the customer
self-order path from the INSERT policy to close this bypass.

### order_items SELECT
Already allows customer access through order ownership. Correct.

### branch_menu_items SELECT
Currently only allows staff roles (owner/manager/kitchen/cashier).
Customers need to read branch menu items to see the menu. We add a
policy allowing customers to SELECT branch_menu_items for their
restaurant's branches.
*/

-- ============================================================================
-- 1. create_customer_order RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION create_customer_order(
  p_branch_id uuid,
  p_cart_items jsonb,
  p_payment_method payment_method DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer RECORD;
  v_order_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_item jsonb;
  v_menu_item_id uuid;
  v_quantity int;
  v_unit_price numeric(10,2);
  v_item_subtotal numeric(10,2);
  v_mi_restaurant uuid;
  v_count int := 0;
BEGIN
  -- 1. Validate authenticated user and find active customer record
  SELECT c.id, c.restaurant_id, c.status INTO v_customer
  FROM customers c
  WHERE c.user_id = auth.uid()
    AND c.status = 'active';

  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'No active customer account found';
  END IF;

  -- 2. Validate branch belongs to customer's restaurant
  SELECT b.id INTO v_order_id
  FROM branches b
  WHERE b.id = p_branch_id
    AND b.restaurant_id = v_customer.restaurant_id
    AND b.status = 'active';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Branch not found or not available for your restaurant';
  END IF;

  -- 3. Validate cart is not empty
  IF p_cart_items IS NULL OR jsonb_array_length(p_cart_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  -- 3a. Validate cart size
  IF jsonb_array_length(p_cart_items) > 200 THEN
    RAISE EXCEPTION 'Cart cannot exceed 200 items';
  END IF;

  -- 4. Validate each cart item and compute subtotal
  FOR v_item IN SELECT jsonb_array_elements(p_cart_items) LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::uuid;
    v_quantity := (v_item->>'quantity')::int;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for item %', v_menu_item_id;
    END IF;

    IF v_quantity > 9999 THEN
      RAISE EXCEPTION 'Quantity for item % exceeds maximum (9999)', v_menu_item_id;
    END IF;

    -- Validate menu item belongs to customer's restaurant
    SELECT mi.restaurant_id INTO v_mi_restaurant
    FROM menu_items mi
    WHERE mi.id = v_menu_item_id;

    IF v_mi_restaurant IS NULL THEN
      RAISE EXCEPTION 'Menu item % not found', v_menu_item_id;
    END IF;

    IF v_mi_restaurant <> v_customer.restaurant_id THEN
      RAISE EXCEPTION 'Menu item % does not belong to your restaurant', v_menu_item_id;
    END IF;

    -- Validate branch_menu_items: exists, available, belongs to requested branch
    SELECT bmi.price INTO v_unit_price
    FROM branch_menu_items bmi
    WHERE bmi.menu_item_id = v_menu_item_id
      AND bmi.branch_id = p_branch_id
      AND bmi.is_available = true;

    IF v_unit_price IS NULL THEN
      RAISE EXCEPTION 'Item % is not available at this branch', v_menu_item_id;
    END IF;

    v_item_subtotal := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_item_subtotal;
    v_count := v_count + 1;
  END LOOP;

  -- 5. Compute totals (no discount, no tax for customer orders initially)
  v_tax := 0;
  v_total := v_subtotal;

  -- 6. Create the order
  -- Customer orders start as 'unpaid' — payment is handled at the restaurant
  INSERT INTO orders (
    restaurant_id, branch_id, customer_id, cashier_id,
    status, subtotal, discount, tax, total,
    payment_status, payment_method, notes
  ) VALUES (
    v_customer.restaurant_id,
    p_branch_id,
    v_customer.id,
    NULL,
    'pending',
    v_subtotal,
    0,
    v_tax,
    v_total,
    'unpaid',
    p_payment_method,
    p_notes
  )
  RETURNING id INTO v_order_id;

  -- 7. Create order_items using server-validated prices
  FOR v_item IN SELECT jsonb_array_elements(p_cart_items) LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::uuid;
    v_quantity := (v_item->>'quantity')::int;

    SELECT bmi.price INTO v_unit_price
    FROM branch_menu_items bmi
    WHERE bmi.menu_item_id = v_menu_item_id
      AND bmi.branch_id = p_branch_id;

    v_item_subtotal := v_unit_price * v_quantity;

    INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal)
    VALUES (v_order_id, v_menu_item_id, v_quantity, v_unit_price, v_item_subtotal);
  END LOOP;

  -- 8. Return the created order
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', 0,
    'tax', v_tax,
    'total', v_total,
    'item_count', v_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION create_customer_order(uuid, jsonb, payment_method, text) FROM anon;
REVOKE EXECUTE ON FUNCTION create_customer_order(uuid, jsonb, payment_method, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_customer_order(uuid, jsonb, payment_method, text) TO authenticated;

-- ============================================================================
-- 2. Remove customer self-order path from orders INSERT policy
--    Customer order creation must go through create_customer_order RPC only
-- ============================================================================

DROP POLICY IF EXISTS "insert_orders" ON orders;
CREATE POLICY "insert_orders" ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    is_branch_member(restaurant_id, branch_id, ARRAY['manager']::member_role[])
  );

-- ============================================================================
-- 3. Add customer SELECT policy for branch_menu_items
--    Customers need to see menu items for branches of their restaurant
-- ============================================================================

DROP POLICY IF EXISTS "select_branch_menu_items_customer" ON branch_menu_items;
CREATE POLICY "select_branch_menu_items_customer" ON branch_menu_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.user_id = auth.uid()
        AND c.status = 'active'
        AND c.restaurant_id = (
          SELECT b.restaurant_id FROM branches b WHERE b.id = branch_menu_items.branch_id
        )
    )
  );

-- ============================================================================
-- 4. Add customer SELECT policy for branches (already exists via
--    is_restaurant_member, but customers are NOT restaurant_members.
--    We need a separate policy for customers to see their restaurant's branches)
-- ============================================================================

DROP POLICY IF EXISTS "select_branches_customer" ON branches;
CREATE POLICY "select_branches_customer" ON branches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.user_id = auth.uid()
        AND c.status = 'active'
        AND c.restaurant_id = branches.restaurant_id
    )
  );

-- ============================================================================
-- 5. Add customer SELECT policy for restaurants
--    Customers need to see their restaurant's basic info
-- ============================================================================

DROP POLICY IF EXISTS "select_restaurant_customer" ON restaurants;
CREATE POLICY "select_restaurant_customer" ON restaurants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.user_id = auth.uid()
        AND c.status = 'active'
        AND c.restaurant_id = restaurants.id
    )
  );

-- ============================================================================
-- 6. Add customer SELECT policy for menu_items and menu_categories
--    Customers need to see menu items for their restaurant
-- ============================================================================

DROP POLICY IF EXISTS "select_menu_items_customer" ON menu_items;
CREATE POLICY "select_menu_items_customer" ON menu_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.user_id = auth.uid()
        AND c.status = 'active'
        AND c.restaurant_id = menu_items.restaurant_id
    )
  );

DROP POLICY IF EXISTS "select_menu_categories_customer" ON menu_categories;
CREATE POLICY "select_menu_categories_customer" ON menu_categories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.user_id = auth.uid()
        AND c.status = 'active'
        AND c.restaurant_id = menu_categories.restaurant_id
    )
  );

-- ============================================================================
-- 7. Restrict customer self-UPDATE on customers table to safe fields only
--    A trigger prevents customers from changing restaurant_id, user_id, status
-- ============================================================================

CREATE OR REPLACE FUNCTION protect_customer_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when the updater is the customer themselves (not staff)
  -- Staff updates go through their own RLS path with is_restaurant_member
  -- We check: if auth.uid() = OLD.user_id, then it's a self-update
  IF auth.uid() = OLD.user_id THEN
    IF NEW.restaurant_id <> OLD.restaurant_id THEN
      RAISE EXCEPTION 'Cannot change restaurant_id';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Cannot change user_id';
    END IF;
    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Cannot change status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_customer_fields ON customers;
CREATE TRIGGER trg_protect_customer_fields
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION protect_customer_immutable_fields();
