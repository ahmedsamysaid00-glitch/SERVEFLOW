/*
# 0016: Cashier POS order idempotency

Adds server-side idempotency to `create_cashier_order` so that a
network failure after the order is created cannot result in a
duplicate order on retry.

Design:
- The existing unique index `orders_idempotency_key_unique` is scoped
  to `(customer_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
  Cashier orders often have customer_id = NULL (guest orders), so that
  index cannot cover them.
- A new partial unique index `(cashier_id, idempotency_key) WHERE
  idempotency_key IS NOT NULL AND cashier_id IS NOT NULL` covers
  cashier orders exclusively. Customer and cashier namespaces never
  conflict because customer orders have cashier_id = NULL and cashier
  orders have cashier_id = auth.uid().
- The RPC looks up an existing order by (cashier_id, idempotency_key)
  BEFORE inserting, and also catches unique_violation as a race-condition
  fallback.
- The idempotency lookup is scoped to auth.uid() — a different cashier
  with the same key cannot retrieve another cashier's order.
*/

-- 1. Add unique index for cashier idempotency
CREATE UNIQUE INDEX IF NOT EXISTS orders_cashier_idempotency_key_unique
  ON public.orders (cashier_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND cashier_id IS NOT NULL;

-- 2. Recreate create_cashier_order with p_idempotency_key parameter
CREATE OR REPLACE FUNCTION public.create_cashier_order(
  p_cart_items jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_discount numeric DEFAULT 0,
  p_tax_rate numeric DEFAULT 0,
  p_payment_method payment_method DEFAULT 'cash',
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_customer_restaurant uuid;
  v_customer_status customer_status;
  v_mi_restaurant uuid;
  v_count int := 0;
  v_existing_order jsonb;
BEGIN
  -- 0. Idempotency check: if key provided, look for existing order by THIS cashier
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
    WHERE o.cashier_id = auth.uid()
      AND o.idempotency_key = p_idempotency_key;

    IF v_existing_order IS NOT NULL THEN
      RETURN v_existing_order;
    END IF;
  END IF;

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

  -- 2a. Validate cart size (prevent oversized payloads)
  IF jsonb_array_length(p_cart_items) > 200 THEN
    RAISE EXCEPTION 'Cart cannot exceed 200 items';
  END IF;

  -- 3. Validate discount and tax rate
  IF p_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  IF p_tax_rate < 0 OR p_tax_rate > 1 THEN
    RAISE EXCEPTION 'Tax rate must be between 0 and 1 (0%% to 100%%)';
  END IF;

  -- 4. Validate customer belongs to this restaurant and is active (if provided)
  IF p_customer_id IS NOT NULL THEN
    SELECT restaurant_id, status INTO v_customer_restaurant, v_customer_status
    FROM customers WHERE id = p_customer_id;
    IF v_customer_restaurant IS NULL THEN
      RAISE EXCEPTION 'Customer not found';
    END IF;
    IF v_customer_restaurant <> v_member.restaurant_id THEN
      RAISE EXCEPTION 'Customer does not belong to this restaurant';
    END IF;
    IF v_customer_status = 'blocked' THEN
      RAISE EXCEPTION 'Customer is blocked and cannot place orders';
    END IF;
  END IF;

  -- 5. Validate each cart item and compute subtotal
  FOR v_item IN SELECT jsonb_array_elements(p_cart_items) LOOP
    v_menu_item_id := (v_item->>'menu_item_id')::uuid;
    v_quantity := (v_item->>'quantity')::int;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for item %', v_menu_item_id;
    END IF;

    IF v_quantity > 9999 THEN
      RAISE EXCEPTION 'Quantity for item % exceeds maximum (9999)', v_menu_item_id;
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

  -- 7. Create the order (with idempotency_key)
  -- payment_status is always 'paid' — the cashier records payment at POS.
  -- This does NOT mean an external gateway verified the payment.
  BEGIN
    INSERT INTO orders (
      restaurant_id, branch_id, customer_id, cashier_id,
      status, subtotal, discount, tax, total,
      payment_status, payment_method, notes, idempotency_key
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
      'paid',
      p_payment_method,
      p_notes,
      p_idempotency_key
    )
    RETURNING id INTO v_order_id;
  EXCEPTION WHEN unique_violation THEN
    -- Race condition: another request with same (cashier_id, idempotency_key) won.
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
    WHERE o.cashier_id = auth.uid()
      AND o.idempotency_key = p_idempotency_key;

    RETURN v_existing_order;
  END;

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
$function$;

-- 3. Revoke execute from anon and PUBLIC, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.create_cashier_order(jsonb, uuid, numeric, numeric, payment_method, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_cashier_order(jsonb, uuid, numeric, numeric, payment_method, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cashier_order(jsonb, uuid, numeric, numeric, payment_method, text, text) TO authenticated;
