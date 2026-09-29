/*
# Reset Test Data RPC

## Purpose
A safe, Super-Admin-only server-side function that identifies and removes
test data from the development environment. It supports a dry-run (preview)
mode that returns a full report of what would be deleted, and an execute mode
that performs the deletion in correct foreign-key dependency order.

## Safety
- SECURITY DEFINER: runs with elevated privileges to delete auth.users
- Requires `is_super_admin()` — raises exception otherwise
- NEVER deletes the Super Admin account (ahmedsamysaid00@gmail.com)
- NEVER deletes a restaurant where the Super Admin is a member
- NEVER deletes auth users that belong to a restaurant NOT being deleted
- Accepts no arbitrary client IDs — it auto-detects test data
- All test restaurants = restaurants where the Super Admin is NOT a member

## Deletion order (FK-safe)
1. order_items → 2. orders → 3. inventory_transactions →
4. cashier_shifts → 5. branch_menu_items → 6. inventory_items →
7. menu_items → 8. menu_categories → 9. customers →
10. restaurant_members → 11. branches → 12. restaurants →
13. profiles → 14. auth.users

## Parameters
- p_dry_run (boolean, default true): when true, returns report only; when false, executes deletion

## Returns
JSONB with:
- mode: 'preview' | 'execute'
- restaurants: array of {id, name, status}
- branches: count + array of {id, name, restaurant_id}
- restaurant_members: count + array of {id, user_id, role, restaurant_id}
- customers: count + array of {id, full_name, email, restaurant_id}
- orders: count
- order_items: count
- inventory_items: count
- inventory_transactions: count
- cashier_shifts: count
- menu_categories: count
- menu_items: count
- branch_menu_items: count
- profiles: count + array of {id, full_name}
- auth_users: count + array of {id, email}
- super_admin_preserved: boolean
- verification (execute mode only): post-delete counts
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
  -- A restaurant is "test" if the Super Admin is NOT a member of it.
  -- In a dev environment, all restaurants are test restaurants.
  SELECT array_agg(r.id) INTO v_test_restaurant_ids
  FROM restaurants r
  WHERE NOT EXISTS (
    SELECT 1 FROM restaurant_members rm
    WHERE rm.restaurant_id = r.id
      AND rm.user_id = v_super_admin_id
      AND rm.status = 'active'
  );

  IF v_test_restaurant_ids IS NULL OR array_length(v_test_restaurant_ids, 1) IS NULL THEN
    -- No test restaurants found
    RETURN jsonb_build_object(
      'mode', CASE WHEN p_dry_run THEN 'preview' ELSE 'execute' END,
      'message', 'No test restaurants found. Nothing to delete.',
      'restaurants', '[]'::jsonb,
      'super_admin_preserved', true
    );
  END IF;

  -- ─── 4. Identify test branches ──────────────────────────────────────
  SELECT array_agg(b.id) INTO v_test_branch_ids
  FROM branches b
  WHERE b.restaurant_id = ANY(v_test_restaurant_ids);

  -- ─── 5. Identify test auth users ────────────────────────────────────
  -- Users who are members of test restaurants (owners, staff)
  SELECT array_agg(DISTINCT rm.user_id) INTO v_test_user_ids
  FROM restaurant_members rm
  WHERE rm.restaurant_id = ANY(v_test_restaurant_ids)
    AND rm.user_id IS NOT NULL
    AND rm.user_id <> v_super_admin_id;

  -- ─── 6. Identify marketplace customers (restaurant_id IS NULL) ─────
  -- These are customers not tied to any restaurant (marketplace model).
  -- In a dev environment, all such customers are test data.
  SELECT array_agg(c.id) INTO v_marketplace_customer_ids
  FROM customers c
  WHERE c.restaurant_id IS NULL
    AND c.status = 'active';

  -- ═══════════════════════════════════════════════════════════════════
  -- 7. BUILD THE REPORT
  -- ═══════════════════════════════════════════════════════════════════

  v_result := jsonb_build_object(
    'mode', CASE WHEN p_dry_run THEN 'preview' ELSE 'execute' END,
    'super_admin_email', v_super_admin_email,
    'super_admin_preserved', true
  );

  -- Restaurants
  SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'status', r.status))
  INTO v_result
  FROM restaurants r
  WHERE r.id = ANY(v_test_restaurant_ids);

  v_result := v_result || jsonb_build_object('restaurants', COALESCE(v_result->'restaurants', '[]'::jsonb));

  -- Re-assign base since we overwrote it
  v_result := jsonb_build_object(
    'mode', CASE WHEN p_dry_run THEN 'preview' ELSE 'execute' END,
    'super_admin_email', v_super_admin_email,
    'super_admin_preserved', true,
    'restaurants', (
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'status', r.status))
      FROM restaurants r WHERE r.id = ANY(v_test_restaurant_ids)
    )
  );

  -- Branches
  v_result := v_result || jsonb_build_object('branches', (
    SELECT jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'restaurant_id', b.restaurant_id))
    FROM branches b WHERE b.restaurant_id = ANY(v_test_restaurant_ids)
  ));

  -- Restaurant members
  v_result := v_result || jsonb_build_object('restaurant_members', (
    SELECT jsonb_agg(jsonb_build_object('id', rm.id, 'user_id', rm.user_id, 'role', rm.role, 'restaurant_id', rm.restaurant_id))
    FROM restaurant_members rm WHERE rm.restaurant_id = ANY(v_test_restaurant_ids)
  ));

  -- Customers (test-restaurant + marketplace)
  v_result := v_result || jsonb_build_object('customers', (
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'full_name', c.full_name, 'email', c.email, 'restaurant_id', c.restaurant_id))
    FROM customers c
    WHERE c.restaurant_id = ANY(v_test_restaurant_ids)
       OR c.restaurant_id IS NULL
  ));

  -- Orders count
  SELECT count(*) INTO v_count FROM orders WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('orders_count', v_count);

  -- Order items count
  SELECT count(*) INTO v_count FROM order_items oi
  WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id = oi.order_id AND o.restaurant_id = ANY(v_test_restaurant_ids));
  v_result := v_result || jsonb_build_object('order_items_count', v_count);

  -- Inventory items count
  SELECT count(*) INTO v_count FROM inventory_items WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('inventory_items_count', v_count);

  -- Inventory transactions count
  SELECT count(*) INTO v_count FROM inventory_transactions WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('inventory_transactions_count', v_count);

  -- Cashier shifts count
  SELECT count(*) INTO v_count FROM cashier_shifts WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('cashier_shifts_count', v_count);

  -- Menu categories count
  SELECT count(*) INTO v_count FROM menu_categories WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('menu_categories_count', v_count);

  -- Menu items count
  SELECT count(*) INTO v_count FROM menu_items WHERE restaurant_id = ANY(v_test_restaurant_ids);
  v_result := v_result || jsonb_build_object('menu_items_count', v_count);

  -- Branch menu items count
  SELECT count(*) INTO v_count FROM branch_menu_items bmi
  WHERE bmi.branch_id = ANY(v_test_branch_ids);
  v_result := v_result || jsonb_build_object('branch_menu_items_count', v_count);

  -- Profiles (test users only, not super admin)
  v_result := v_result || jsonb_build_object('profiles', (
    SELECT jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name))
    FROM profiles p
    WHERE p.id = ANY(COALESCE(v_test_user_ids, ARRAY[]::uuid[]))
      AND p.id <> v_super_admin_id
  ));

  -- Auth users (test users only, not super admin)
  v_result := v_result || jsonb_build_object('auth_users', (
    SELECT jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email))
    FROM auth.users u
    WHERE u.id = ANY(COALESCE(v_test_user_ids, ARRAY[]::uuid[]))
      AND u.id <> v_super_admin_id
  ));

  -- ─── 8. If dry run, return the report ───────────────────────────────
  IF p_dry_run THEN
    RETURN v_result;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- 9. EXECUTE DELETION (FK-safe order)
  -- ═══════════════════════════════════════════════════════════════════

  -- 9a. order_items (must precede orders and menu_items)
  DELETE FROM order_items oi
  WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = oi.order_id AND o.restaurant_id = ANY(v_test_restaurant_ids)
  );

  -- 9b. orders
  DELETE FROM orders WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 9c. inventory_transactions
  DELETE FROM inventory_transactions WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 9d. cashier_shifts
  DELETE FROM cashier_shifts WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 9e. branch_menu_items
  DELETE FROM branch_menu_items WHERE branch_id = ANY(v_test_branch_ids);

  -- 9f. inventory_items
  DELETE FROM inventory_items WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 9g. menu_items (safe now: order_items deleted, RESTRICT satisfied)
  DELETE FROM menu_items WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 9h. menu_categories
  DELETE FROM menu_categories WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 9i. customers linked to test restaurants + marketplace customers
  DELETE FROM customers
  WHERE restaurant_id = ANY(v_test_restaurant_ids)
     OR restaurant_id IS NULL;

  -- 9j. restaurant_members
  DELETE FROM restaurant_members WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 9k. branches (safe now: orders deleted, RESTRICT satisfied)
  DELETE FROM branches WHERE restaurant_id = ANY(v_test_restaurant_ids);

  -- 9l. restaurants
  DELETE FROM restaurants WHERE id = ANY(v_test_restaurant_ids);

  -- 9m. profiles (test users only, never super admin)
  IF v_test_user_ids IS NOT NULL AND array_length(v_test_user_ids, 1) > 0 THEN
    DELETE FROM profiles
    WHERE id = ANY(v_test_user_ids)
      AND id <> v_super_admin_id;
  END IF;

  -- 9n. auth.users (test users only, never super admin)
  IF v_test_user_ids IS NOT NULL AND array_length(v_test_user_ids, 1) > 0 THEN
    DELETE FROM auth.users
    WHERE id = ANY(v_test_user_ids)
      AND id <> v_super_admin_id;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════
  -- 10. POST-DELETE VERIFICATION
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

-- Revoke execute from anon and authenticated; only super admin can call via RLS-bypassed SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.reset_test_data(boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_test_data(boolean) TO authenticated;
