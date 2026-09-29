/*
# Update create_customer_order to support idempotency

The RPC now accepts p_idempotency_key (text, optional).
If provided and an order already exists for this customer with the same
idempotency_key, the RPC returns the existing order instead of creating
a duplicate.

The idempotency_key is generated client-side per checkout attempt (a UUID)
and stored in orders.idempotency_key. The UNIQUE index on
(customer_id, idempotency_key) ensures atomicity: if two requests with the
same key race, one will succeed and the other will hit the unique constraint.
The RPC catches the unique violation and returns the existing order.
*/

CREATE OR REPLACE FUNCTION create_customer_order(
  p_branch_id uuid,
  p_cart_items jsonb,
  p_payment_method payment_method DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
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
  v_existing_order jsonb;
BEGIN
  -- 0. Idempotency check: if key provided, look for existing order
  IF p_idempotency_key IS NOT NULL THEN
    SELECT jsonb_build_object(
      'order_id', o.id,
      'subtotal', o.subtotal,
      'discount', o.discount,
      'tax', o.tax,
      'total', o.total,
      'item_count', (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id),
      'idempotent_replay', true
    ) INTO v_existing_order
    FROM orders o
    WHERE o.customer_id = (
        SELECT c.id FROM customers c WHERE c.user_id = auth.uid() AND c.status = 'active'
      )
      AND o.idempotency_key = p_idempotency_key;

    IF v_existing_order IS NOT NULL THEN
      RETURN v_existing_order;
    END IF;
  END IF;

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
  BEGIN
    INSERT INTO orders (
      restaurant_id, branch_id, customer_id, cashier_id,
      status, subtotal, discount, tax, total,
      payment_status, payment_method, notes, idempotency_key
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
      p_notes,
      p_idempotency_key
    )
    RETURNING id INTO v_order_id;
  EXCEPTION WHEN unique_violation THEN
    -- Race condition: another request with same idempotency_key won.
    -- Return the already-created order.
    SELECT jsonb_build_object(
      'order_id', o.id,
      'subtotal', o.subtotal,
      'discount', o.discount,
      'tax', o.tax,
      'total', o.total,
      'item_count', (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id),
      'idempotent_replay', true
    ) INTO v_existing_order
    FROM orders o
    WHERE o.customer_id = v_customer.id
      AND o.idempotency_key = p_idempotency_key;

    RETURN v_existing_order;
  END;

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

-- Re-grant permissions (CREATE OR REPLACE may reset them)
REVOKE EXECUTE ON FUNCTION create_customer_order(uuid, jsonb, payment_method, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION create_customer_order(uuid, jsonb, payment_method, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_customer_order(uuid, jsonb, payment_method, text, text) TO authenticated;
