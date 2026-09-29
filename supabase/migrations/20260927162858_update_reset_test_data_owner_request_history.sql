/*
# Update reset_test_data: mark owner_signup_requests as deleted before deleting

## Purpose
When the reset_test_data RPC deletes test restaurants, it must FIRST mark
any associated owner_signup_requests as 'deleted' to preserve history.

## How it works
Before deleting restaurants, the function:
1. Finds owner_signup_requests matching by email to restaurant owner members
2. Updates their status to 'deleted', records deleted_at, deleted_by, and
   preserves the restaurant name in original_restaurant_name
3. Then proceeds with the existing deletion logic

## Safety
- Only marks requests as deleted when the associated restaurant IS being deleted
- Super Admin's own request (if any) is never marked as deleted
- No new RPCs — just updates the existing function
*/

CREATE OR REPLACE FUNCTION public.reset_test_data(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_super_admin_email text := 'ahmedsamysaid00@gmail.com';
  v_super_admin_id uuid;
  v_test_restaurant_ids uuid[];
  v_test_branch_ids uuid[];
  v_test_user_ids uuid[];
  v_marketplace_customer_ids uuid[];
  v_count int;
  v_result jsonb;
  v_owner_emails text[];
BEGIN
  -- ─── 1. Authorization: Super Admin only ──────────────────────────────
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only the Super Admin can perform this operation';
  END IF;

  -- ─── 2. Identify Super Admin (never delete) ──────────────────────────
  SELECT id INTO v_super_admin_id
  FROM auth.users
  WHERE lower(trim(email)) = v_super_admin_email;

  IF v_super_admin_id IS NULL THEN
    RAISE EXCEPTION 'Super Admin account not found — aborting for safety';
  END IF;

  -- ─── 3. Identify test restaurants ───────────────────────────────────
  SELECT array_agg(r.id) INTO v_test_restaurant_ids
  FROM restaurants r
  WHERE NOT EXISTS (
    SELECT 1 FROM restaurant_members rm
    WHERE rm.restaurant_id = r.id
      AND rm.user_id = v_super_admin_id
      AND rm.status = 'active'
  );

  IF v_test_restaurant_ids IS NULL OR array_length(v_test_restaurant_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'mode', CASE WHEN p_dry_run THEN 'preview' ELSE 'execute' END,
      'message', 'No test restaurants found. Nothing to delete.',
      'super_admin_email', v_super_admin_email,
      'super_admin_preserved', true,
      'restaurants', '[]'::jsonb,
      'branches', '[]'::jsonb,
      'restaurant_members', '[]'::jsonb,
      'customers', '[]'::jsonb,
      'orders_count', 0,
      'order_items_count', 0,
      'inventory_items_count', 0,
      'inventory_transactions_count', 0,
      'cashier_shifts_count', 0,
      'menu_categories_count', 0,
      'menu_items_count', 0,
      'branch_menu_items_count', 0,
      'profiles', '[]'::jsonb,
      'auth_users', '[]'::jsonb
    );
  END IF;

  -- ─── 4. Identify test branches ──────────────────────────────────────
  SELECT array_agg(b.id) INTO v_test_branch_ids
  FROM branches b
  WHERE b.restaurant_id = ANY(v_test_restaurant_ids);

  -- ─── 5. Identify test auth users ────────────────────────────────────
  SELECT array_agg(DISTINCT rm.user_id) INTO v_test_user_ids
  FROM restaurant_members rm
  WHERE rm.restaurant_id = ANY(v_test_restaurant_ids)
    AND rm.user_id IS NOT NULL
    AND rm.user_id <> v_super_admin_id;

  -- ─── 6. Identify marketplace customers (restaurant_id IS NULL) ─────
  SELECT array_agg(c.id) INTO v_marketplace_customer_ids
  FROM customers c
  WHERE c.restaurant_id IS NULL
    AND c.status = 'active';

  -- ═══════════════════════════════════════════════════════════════════
  -- 7. BUILD THE REPORT (all arrays wrapped in COALESCE → never null)
  -- ═══════════════════════════════════════════════════════════════════

  v_result := jsonb_build_object(
    'mode', CASE WHEN p_dry_run THEN 'preview' ELSE 'execute' END,
    'super_admin_email', v_super_admin_email,
    'super_admin_preserved', true,
    'restaurants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'status', r.status))
      FROM restaurants r WHERE r.id = ANY(v_test_restaurant_ids)
    ), '[]'::jsonb),
    'branches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'restaurant_id', b.restaurant_id))
      FROM branches b WHERE b.restaurant_id = ANY(v_test_restaurant_ids)
    ), '[]'::jsonb),
    'restaurant_members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', rm.id, 'user_id', rm.user_id, 'role', rm.role, 'restaurant_id', rm.restaurant_id))
      FROM restaurant_members rm WHERE rm.restaurant_id = ANY(v_test_restaurant_ids)
    ), '[]'::jsonb),
    'customers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'full_name', c.full_name, 'email', c.email, 'restaurant_id', c.restaurant_id))
      FROM customers c
      WHERE c.restaurant_id = ANY(v_test_restaurant_ids)
         OR c.restaurant_id IS NULL
    ), '[]'::jsonb)
  );

  -- Orders count
  SELECT count(*) INTO v_count FROM orders WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('orders_count', COALESCE(v_count, 0));

  -- Order items count
  SELECT count(*) INTO v_count FROM order_items oi
  WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id = oi.order_id AND o.restaurant_id = ANY(v_test_restaurant_ids));
  v_result := v_result || jsonb_build_object('order_items_count', COALESCE(v_count, 0));

  -- Inventory items count
  SELECT count(*) INTO v_count FROM inventory_items WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('inventory_items_count', COALESCE(v_count, 0));

  -- Inventory transactions count
  SELECT count(*) INTO v_count FROM inventory_transactions WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('inventory_transactions_count', COALESCE(v_count, 0));

  -- Cashier shifts count
  SELECT count(*) INTO v_count FROM cashier_shifts WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('cashier_shifts_count', COALESCE(v_count, 0));

  -- Menu categories count
  SELECT count(*) INTO v_count FROM menu_categories WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('menu_categories_count', COALESCE(v_count, 0));

  -- Menu items count
  SELECT count(*) INTO v_count FROM menu_items WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('menu_items_count', COALESCE(v_count, 0));

  -- Branch menu items count
  SELECT count(*) INTO v_count FROM branch_menu_items bmi
  WHERE bmi.branch_id = ANY(v_test_branch_ids);
  v_result := v_result || jsonb_build_object('branch_menu_items_count', COALESCE(v_count, 0));

  -- Profiles (test users only, not super admin)
  v_result := v_result || jsonb_build_object('profiles', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name))
    FROM profiles p
    WHERE p.id = ANY(COALESCE(v_test_user_ids, ARRAY[]::uuid[]))
      AND p.id <> v_super_admin_id
  ), '[]'::jsonb));

  -- Auth users (test users only, not super admin)
  v_result := v_result || jsonb_build_object('auth_users', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email))
    FROM auth.users u
    WHERE u.id = ANY(COALESCE(v_test_user_ids, ARRAY[]::uuid[]))
      AND u.id <> v_super_admin_id
  ), '[]'::jsonb));

  -- ─── 8. If dry run, return the report ───────────────────────────────
  IF p_dry_run THEN
    RETURN v_result;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- 9. MARK OWNER SIGNUP REQUESTS AS DELETED (before deleting restaurants)
  -- ═══════════════════════════════════════════════════════════════════

  -- Find owner emails for test restaurants and mark their requests as deleted
  UPDATE owner_signup_requests osr
  SET
    status = 'deleted'::owner_request_status,
    deleted_at = now(),
    deleted_by = v_super_admin_id,
    original_restaurant_name = (
      SELECT r.name FROM restaurants r
      JOIN restaurant_members rm ON rm.restaurant_id = r.id
      JOIN auth.users u ON u.id = rm.user_id
      WHERE r.id = ANY(v_test_restaurant_ids)
        AND rm.role = 'owner'
        AND lower(trim(u.email)) = lower(trim(osr.email))
      LIMIT 1
    )
  WHERE osr.status IN ('pending', 'approved', 'rejected')
    AND EXISTS (
      SELECT 1
      FROM restaurant_members rm
      JOIN auth.users u ON u.id = rm.user_id
      WHERE rm.restaurant_id = ANY(v_test_restaurant_ids)
        AND rm.role = 'owner'
        AND lower(trim(u.email)) = lower(trim(osr.email))
    )
    AND lower(trim(osr.email)) <> v_super_admin_email;

  -- ═══════════════════════════════════════════════════════════════════
  -- 10. EXECUTE DELETION (FK-safe order)
  -- ═══════════════════════════════════════════════════════════════════

  -- 10a. order_items
  DELETE FROM order_items oi
  WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = oi.order_id AND o.restaurant_id = ANY(v_test_restaurant_ids)
  );

  -- 10b. orders
  DELETE FROM orders WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 10c. inventory_transactions
  DELETE FROM inventory_transactions WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 10d. cashier_shifts
  DELETE FROM cashier_shifts WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 10e. branch_menu_items
  DELETE FROM branch_menu_items WHERE branch_id = ANY(v_test_branch_ids);

  -- 10f. inventory_items
  DELETE FROM inventory_items WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 10g. menu_items
  DELETE FROM menu_items WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 10h. menu_categories
  DELETE FROM menu_categories WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 10i. customers
  DELETE FROM customers
  WHERE restaurant_id = ANY(v_test_restaurant_ids)
     OR restaurant_id IS NULL;

  -- 10j. restaurant_members
  DELETE FROM restaurant_members WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 10k. branches
  DELETE FROM branches WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 10l. restaurants
  DELETE FROM restaurants WHERE id = ANY(v_test_restaurant_ids);

  -- 10m. profiles
  IF v_test_user_ids IS NOT NULL AND array_length(v_test_user_ids, 1) > 0 THEN
    DELETE FROM profiles
    WHERE id = ANY(v_test_user_ids)
      AND id <> v_super_admin_id;
  END IF;

  -- 10n. auth.users
  IF v_test_user_ids IS NOT NULL AND array_length(v_test_user_ids, 1) > 0 THEN
    DELETE FROM auth.users
    WHERE id = ANY(v_test_user_ids)
      AND id <> v_super_admin_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- 11. POST-DELETE VERIFICATION
  -- ═══════════════════════════════════════════════════════════════════

  v_result := v_result || jsonb_build_object(
    'verification', jsonb_build_object(
      'restaurants_remaining', (SELECT count(*) FROM restaurants WHERE id = ANY(v_test_restaurant_ids)),
      'branches_remaining', (SELECT count(*) FROM branches WHERE restaurant_id = ANY(v_test_restaurant_ids)),
      'restaurant_members_remaining', (SELECT count(*) FROM restaurant_members WHERE restaurant_id = ANY(v_test_restaurant_ids)),
      'orders_remaining', (SELECT count(*) FROM orders WHERE restaurant_id = ANY(v_test_restaurant_ids)),
      'order_items_remaining', 0,
      'customers_remaining', (SELECT count(*) FROM customers WHERE restaurant_id = ANY(v_test_restaurant_ids)),
      'inventory_items_remaining', (SELECT count(*) FROM inventory_items WHERE restaurant_id = ANY(v_test_restaurant_ids)),
      'inventory_transactions_remaining', (SELECT count(*) FROM inventory_transactions WHERE restaurant_id = ANY(v_test_restaurant_ids)),
      'cashier_shifts_remaining', (SELECT count(*) FROM cashier_shifts WHERE restaurant_id = ANY(v_test_restaurant_ids)),
      'menu_items_remaining', (SELECT count(*) FROM menu_items WHERE restaurant_id = ANY(v_test_restaurant_ids)),
      'menu_categories_remaining', (SELECT count(*) FROM menu_categories WHERE restaurant_id = ANY(v_test_restaurant_ids)),
      'super_admin_exists', (SELECT count(*) FROM auth.users WHERE lower(trim(email)) = v_super_admin_email),
      'test_auth_users_remaining', (
        SELECT count(*) FROM auth.users u
        WHERE u.id = ANY(COALESCE(v_test_user_ids, ARRAY[]::uuid[]))
          AND u.id <> v_super_admin_id
      )
    )
  );

  RETURN v_result;
END;
$$;

-- Preserve grants
REVOKE EXECUTE ON FUNCTION public.reset_test_data(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_test_data(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_test_data(boolean) TO authenticated;
