/*
# ServeFlow Security Audit Fixes

## Issues discovered and fixed

### 1. SECURITY DEFINER functions publicly executable (CRITICAL)
The membership helper functions (is_restaurant_member, is_branch_member,
accessible_branches) and the signup trigger (handle_new_user) were all
callable by the anon role via /rest/v1/rpc/ because Postgres grants
EXECUTE to PUBLIC by default. The previous REVOKE only removed grants
from anon and authenticated explicitly, but PUBLIC still granted access.

Fix: REVOKE EXECUTE FROM PUBLIC on all SECURITY DEFINER functions.
Re-grant EXECUTE to authenticated for the membership helpers (they are
called inside RLS policies which evaluate under the caller's role, so
authenticated users need execute permission for policies to work).
handle_new_user stays revoked from everyone — only the auth trigger calls it.

### 2. set_updated_at mutable search_path (WARN)
The trigger function had no search_path set, allowing search-path
manipulation. Fixed by adding SET search_path = public.

### 3. Owner had operational write permissions (POLICY VIOLATION)
The spec says Owner is "primarily monitoring/read-only regarding
restaurant operations." But owner was included in the write role arrays
for orders, order_items, branch_menu_items, inventory_items, and
inventory_transactions. Removed owner from all operational write
policies. Owner retains full read access everywhere and write access only
to restaurant-level config (restaurants, branches, menu_categories,
menu_items, restaurant_members).

### 4. No cross-tenant relationship constraints (CRITICAL)
RLS prevents unauthorized reads/writes, but the database did not verify
that branch.restaurant_id = record.restaurant_id. A cashier with INSERT
permission on orders could create an order with their branch_id but a
foreign restaurant_id (or vice versa). Added trigger-enforced integrity
checks on:
  - orders: branch must belong to the order's restaurant
  - inventory_items: branch must belong to the item's restaurant
  - inventory_transactions: branch must belong to the tx's restaurant
  - menu_items: category must belong to the item's restaurant
  - branch_menu_items: branch and menu_item must share the same restaurant

### 5. Storage path not scoped to restaurants/ prefix (MEDIUM)
The upload/update policies used split_part(name, '/', 2) without
verifying the path starts with 'restaurants/'. A user could upload to
arbitrary paths. Fixed by requiring name LIKE 'restaurants/%' and
verifying the restaurant ID segment matches a restaurant the user belongs to.
*/

-- ============================================================================
-- FIX 1: Revoke PUBLIC execute on SECURITY DEFINER functions
-- ============================================================================

REVOKE EXECUTE ON FUNCTION is_restaurant_member(uuid, member_role[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_branch_member(uuid, uuid, member_role[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION accessible_branches(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_updated_at() FROM PUBLIC;

-- Membership helpers are called inside RLS policies, which evaluate under
-- the caller's role. Authenticated users need execute for policies to work.
GRANT EXECUTE ON FUNCTION is_restaurant_member(uuid, member_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION is_branch_member(uuid, uuid, member_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION accessible_branches(uuid) TO authenticated;
-- handle_new_user and set_updated_at stay revoked from everyone — only
-- internal triggers call them.

-- ============================================================================
-- FIX 2: set_updated_at search_path
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 3: Remove owner from operational write policies
-- Owner is read-only for operations per the architecture spec.
-- ============================================================================

-- orders: owner removed from INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "insert_orders" ON orders;
CREATE POLICY "insert_orders" ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    is_branch_member(restaurant_id, branch_id, ARRAY['manager','cashier']::member_role[])
    OR EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = orders.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_orders" ON orders;
CREATE POLICY "update_orders" ON orders FOR UPDATE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['manager','cashier']::member_role[]))
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['manager','cashier']::member_role[]));

DROP POLICY IF EXISTS "delete_orders" ON orders;
CREATE POLICY "delete_orders" ON orders FOR DELETE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['manager']::member_role[]));

-- order_items: owner removed from INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "insert_order_items" ON order_items;
CREATE POLICY "insert_order_items" ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['manager','cashier']::member_role[])
    )
  );

DROP POLICY IF EXISTS "update_order_items" ON order_items;
CREATE POLICY "update_order_items" ON order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['manager','cashier']::member_role[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['manager','cashier']::member_role[])
    )
  );

DROP POLICY IF EXISTS "delete_order_items" ON order_items;
CREATE POLICY "delete_order_items" ON order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['manager','cashier']::member_role[])
    )
  );

-- branch_menu_items: owner removed from INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "insert_branch_menu_items" ON branch_menu_items;
CREATE POLICY "insert_branch_menu_items" ON branch_menu_items FOR INSERT
  TO authenticated
  WITH CHECK (is_branch_member(
    (SELECT mi.restaurant_id FROM menu_items mi WHERE mi.id = branch_menu_items.menu_item_id),
    branch_id,
    ARRAY['manager','kitchen']::member_role[]
  ));

DROP POLICY IF EXISTS "update_branch_menu_items" ON branch_menu_items;
CREATE POLICY "update_branch_menu_items" ON branch_menu_items FOR UPDATE
  TO authenticated
  USING (is_branch_member(
    (SELECT mi.restaurant_id FROM menu_items mi WHERE mi.id = branch_menu_items.menu_item_id),
    branch_id,
    ARRAY['manager','kitchen']::member_role[]
  ))
  WITH CHECK (is_branch_member(
    (SELECT mi.restaurant_id FROM menu_items mi WHERE mi.id = branch_menu_items.menu_item_id),
    branch_id,
    ARRAY['manager','kitchen']::member_role[]
  ));

DROP POLICY IF EXISTS "delete_branch_menu_items" ON branch_menu_items;
CREATE POLICY "delete_branch_menu_items" ON branch_menu_items FOR DELETE
  TO authenticated
  USING (is_branch_member(
    (SELECT mi.restaurant_id FROM menu_items mi WHERE mi.id = branch_menu_items.menu_item_id),
    branch_id,
    ARRAY['manager','kitchen']::member_role[]
  ));

-- inventory_items: owner removed from INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "insert_inventory_items" ON inventory_items;
CREATE POLICY "insert_inventory_items" ON inventory_items FOR INSERT
  TO authenticated
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['manager','kitchen']::member_role[]));

DROP POLICY IF EXISTS "update_inventory_items" ON inventory_items;
CREATE POLICY "update_inventory_items" ON inventory_items FOR UPDATE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['manager','kitchen']::member_role[]))
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['manager','kitchen']::member_role[]));

DROP POLICY IF EXISTS "delete_inventory_items" ON inventory_items;
CREATE POLICY "delete_inventory_items" ON inventory_items FOR DELETE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['manager']::member_role[]));

-- inventory_transactions: owner removed from INSERT
DROP POLICY IF EXISTS "insert_inventory_tx" ON inventory_transactions;
CREATE POLICY "insert_inventory_tx" ON inventory_transactions FOR INSERT
  TO authenticated
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['manager','kitchen']::member_role[]));

-- ============================================================================
-- FIX 4: Cross-tenant relationship integrity triggers
-- Prevents a record from referencing a branch belonging to a different
-- restaurant than the record's own restaurant_id.
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_order_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_restaurant uuid;
BEGIN
  SELECT restaurant_id INTO v_branch_restaurant FROM branches WHERE id = NEW.branch_id;
  IF v_branch_restaurant IS NULL THEN
    RAISE EXCEPTION 'Referenced branch % does not exist', NEW.branch_id;
  END IF;
  IF v_branch_restaurant <> NEW.restaurant_id THEN
    RAISE EXCEPTION 'Order restaurant_id (%) does not match branch restaurant_id (%)', NEW.restaurant_id, v_branch_restaurant;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_branch ON orders;
CREATE TRIGGER trg_validate_order_branch
  BEFORE INSERT OR UPDATE OF branch_id, restaurant_id ON orders
  FOR EACH ROW EXECUTE FUNCTION validate_order_branch();

CREATE OR REPLACE FUNCTION validate_inventory_item_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_restaurant uuid;
BEGIN
  SELECT restaurant_id INTO v_branch_restaurant FROM branches WHERE id = NEW.branch_id;
  IF v_branch_restaurant IS NULL THEN
    RAISE EXCEPTION 'Referenced branch % does not exist', NEW.branch_id;
  END IF;
  IF v_branch_restaurant <> NEW.restaurant_id THEN
    RAISE EXCEPTION 'Inventory item restaurant_id (%) does not match branch restaurant_id (%)', NEW.restaurant_id, v_branch_restaurant;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_inventory_item_branch ON inventory_items;
CREATE TRIGGER trg_validate_inventory_item_branch
  BEFORE INSERT OR UPDATE OF branch_id, restaurant_id ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION validate_inventory_item_branch();

CREATE OR REPLACE FUNCTION validate_inventory_tx_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_restaurant uuid;
  v_item_branch uuid;
BEGIN
  SELECT restaurant_id INTO v_branch_restaurant FROM branches WHERE id = NEW.branch_id;
  IF v_branch_restaurant IS NULL THEN
    RAISE EXCEPTION 'Referenced branch % does not exist', NEW.branch_id;
  END IF;
  IF v_branch_restaurant <> NEW.restaurant_id THEN
    RAISE EXCEPTION 'Transaction restaurant_id (%) does not match branch restaurant_id (%)', NEW.restaurant_id, v_branch_restaurant;
  END IF;
  SELECT branch_id INTO v_item_branch FROM inventory_items WHERE id = NEW.inventory_item_id;
  IF v_item_branch <> NEW.branch_id THEN
    RAISE EXCEPTION 'Transaction branch_id (%) does not match inventory item branch_id (%)', NEW.branch_id, v_item_branch;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_inventory_tx_branch ON inventory_transactions;
CREATE TRIGGER trg_validate_inventory_tx_branch
  BEFORE INSERT OR UPDATE OF branch_id, restaurant_id, inventory_item_id ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION validate_inventory_tx_branch();

CREATE OR REPLACE FUNCTION validate_menu_item_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_restaurant uuid;
BEGIN
  SELECT restaurant_id INTO v_category_restaurant FROM menu_categories WHERE id = NEW.category_id;
  IF v_category_restaurant IS NULL THEN
    RAISE EXCEPTION 'Referenced category % does not exist', NEW.category_id;
  END IF;
  IF v_category_restaurant <> NEW.restaurant_id THEN
    RAISE EXCEPTION 'Menu item restaurant_id (%) does not match category restaurant_id (%)', NEW.restaurant_id, v_category_restaurant;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_menu_item_category ON menu_items;
CREATE TRIGGER trg_validate_menu_item_category
  BEFORE INSERT OR UPDATE OF category_id, restaurant_id ON menu_items
  FOR EACH ROW EXECUTE FUNCTION validate_menu_item_category();

CREATE OR REPLACE FUNCTION validate_branch_menu_item_restaurant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_restaurant uuid;
  v_menu_item_restaurant uuid;
BEGIN
  SELECT restaurant_id INTO v_branch_restaurant FROM branches WHERE id = NEW.branch_id;
  SELECT restaurant_id INTO v_menu_item_restaurant FROM menu_items WHERE id = NEW.menu_item_id;
  IF v_branch_restaurant IS NULL THEN
    RAISE EXCEPTION 'Referenced branch % does not exist', NEW.branch_id;
  END IF;
  IF v_menu_item_restaurant IS NULL THEN
    RAISE EXCEPTION 'Referenced menu item % does not exist', NEW.menu_item_id;
  END IF;
  IF v_branch_restaurant <> v_menu_item_restaurant THEN
    RAISE EXCEPTION 'Branch restaurant (%) does not match menu item restaurant (%)', v_branch_restaurant, v_menu_item_restaurant;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_branch_menu_item ON branch_menu_items;
CREATE TRIGGER trg_validate_branch_menu_item
  BEFORE INSERT OR UPDATE OF branch_id, menu_item_id ON branch_menu_items
  FOR EACH ROW EXECUTE FUNCTION validate_branch_menu_item_restaurant();

REVOKE EXECUTE ON FUNCTION validate_order_branch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_inventory_item_branch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_inventory_tx_branch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_menu_item_category() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION validate_branch_menu_item_restaurant() FROM PUBLIC;

-- ============================================================================
-- FIX 5: Storage path scoping
-- Require path prefix 'restaurants/<restaurant_id>/' for uploads/updates.
-- ============================================================================

DROP POLICY IF EXISTS "members_upload_restaurant_assets" ON storage.objects;
CREATE POLICY "members_upload_restaurant_assets" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-assets'
    AND name LIKE 'restaurants/%'
    AND is_restaurant_member(
      split_part(name, '/', 2)::uuid
    )
  );

DROP POLICY IF EXISTS "members_update_restaurant_assets" ON storage.objects;
CREATE POLICY "members_update_restaurant_assets" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'restaurant-assets'
    AND name LIKE 'restaurants/%'
    AND is_restaurant_member(
      split_part(name, '/', 2)::uuid,
      ARRAY['owner','manager']::member_role[]
    )
  )
  WITH CHECK (
    bucket_id = 'restaurant-assets'
    AND name LIKE 'restaurants/%'
    AND is_restaurant_member(
      split_part(name, '/', 2)::uuid,
      ARRAY['owner','manager']::member_role[]
    )
  );

DROP POLICY IF EXISTS "members_delete_restaurant_assets" ON storage.objects;
CREATE POLICY "members_delete_restaurant_assets" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'restaurant-assets'
    AND name LIKE 'restaurants/%'
    AND is_restaurant_member(
      split_part(name, '/', 2)::uuid,
      ARRAY['owner','manager']::member_role[]
    )
  );
