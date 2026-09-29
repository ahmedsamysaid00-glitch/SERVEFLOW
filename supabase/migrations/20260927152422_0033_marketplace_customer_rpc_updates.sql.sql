/*
# Marketplace: update customer creation and order RPCs

## Changes
1. create_customer_account() — remove p_restaurant_id parameter.
   Customer is created without a permanent restaurant link.
   restaurant_id is left NULL (marketplace customer).

2. create_customer_order() — derive restaurant_id from the selected branch
   instead of from the customer record. This allows a customer to order from
   any active restaurant's active branch.

## Security
- create_customer_account still requires authentication (auth.uid()).
- Still rejects users who already have an active restaurant membership.
- Still rejects users who already have an active customer record.
- create_customer_order still validates:
  - authenticated user with active customer record
  - branch exists and is active
  - branch belongs to an active restaurant
  - each menu item belongs to that restaurant
  - each menu item is available at that branch (is_available = true)
  - cart is not empty, size <= 200
- No service_role keys. RLS not bypassed (SECURITY DEFINER with search_path).
*/

-- 1. Update create_customer_account — no restaurant_id parameter
CREATE OR REPLACE FUNCTION public.create_customer_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing_member int;
  v_existing_customer int;
  v_email text;
  v_full_name text;
  v_customer_id uuid;
BEGIN
  -- 1. Require authenticated user
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Reject users who already have an active restaurant membership
  SELECT count(*) INTO v_existing_member
  FROM restaurant_members
  WHERE user_id = v_user_id AND status = 'active';

  IF v_existing_member > 0 THEN
    RAISE EXCEPTION 'Restaurant staff cannot create a customer account';
  END IF;

  -- 3. Reject users who already have an active customer record
  SELECT count(*) INTO v_existing_customer
  FROM customers
  WHERE user_id = v_user_id AND status = 'active';

  IF v_existing_customer > 0 THEN
    RAISE EXCEPTION 'You already have a customer account';
  END IF;

  -- 4. Get the user's email and full_name
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  SELECT full_name INTO v_full_name FROM profiles WHERE id = v_user_id;

  -- 5. Create the customer record (no restaurant link)
  INSERT INTO customers (user_id, full_name, email, status)
  VALUES (v_user_id, v_full_name, v_email, 'active')
  RETURNING id INTO v_customer_id;

  -- 6. Return the created customer info
  RETURN jsonb_build_object(
    'customer_id', v_customer_id
  );
END;
$function$;

-- 2. Update create_customer_order — derive restaurant_id from branch
CREATE OR REPLACE FUNCTION public.create_customer_order(
  p_branch_id uuid,
  p_cart_items jsonb,
  p_payment_method payment_method DEFAULT NULL::payment_method,
  p_notes text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_branch_restaurant uuid;
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
  SELECT c.id, c.status INTO v_customer
  FROM customers c
  WHERE c.user_id = auth.uid()
  AND c.status = 'active';

  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'No active customer account found';
  END IF;

  -- 2. Validate branch exists, is active, and get its restaurant_id
  SELECT b.restaurant_id INTO v_branch_restaurant
  FROM branches b
  WHERE b.id = p_branch_id
  AND b.status = 'active';

  IF v_branch_restaurant IS NULL THEN
    RAISE EXCEPTION 'Branch not found or not active';
  END IF;

  -- 2a. Validate the restaurant is active
  PERFORM 1 FROM restaurants r
  WHERE r.id = v_branch_restaurant AND r.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Restaurant is not active';
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

    -- Validate menu item belongs to the branch's restaurant
    SELECT mi.restaurant_id INTO v_mi_restaurant
    FROM menu_items mi
    WHERE mi.id = v_menu_item_id;

    IF v_mi_restaurant IS NULL THEN
      RAISE EXCEPTION 'Menu item % not found', v_menu_item_id;
    END IF;

    IF v_mi_restaurant <> v_branch_restaurant THEN
      RAISE EXCEPTION 'Menu item % does not belong to this restaurant', v_menu_item_id;
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

  -- 5. Compute totals
  v_tax := 0;
  v_total := v_subtotal;

  -- 6. Create the order using restaurant_id from the branch
  BEGIN
    INSERT INTO orders (
      restaurant_id, branch_id, customer_id, cashier_id,
      status, subtotal, discount, tax, total,
      payment_status, payment_method, notes, idempotency_key
    ) VALUES (
      v_branch_restaurant,
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
$function$;
