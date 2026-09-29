/*
# Kitchen Role RLS Permissions

Adds kitchen to menu_items, menu_categories, orders UPDATE, and storage
object policies so the Kitchen dashboard can function.
*/

-- menu_items: Add kitchen to INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "insert_menu_items" ON menu_items;
CREATE POLICY "insert_menu_items" ON menu_items FOR INSERT
  TO authenticated
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner','manager','kitchen']::member_role[]));

DROP POLICY IF EXISTS "update_menu_items" ON menu_items;
CREATE POLICY "update_menu_items" ON menu_items FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager','kitchen']::member_role[]))
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner','manager','kitchen']::member_role[]));

DROP POLICY IF EXISTS "delete_menu_items" ON menu_items;
CREATE POLICY "delete_menu_items" ON menu_items FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager','kitchen']::member_role[]));

-- menu_categories: Add kitchen to INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "insert_menu_categories" ON menu_categories;
CREATE POLICY "insert_menu_categories" ON menu_categories FOR INSERT
  TO authenticated
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner','manager','kitchen']::member_role[]));

DROP POLICY IF EXISTS "update_menu_categories" ON menu_categories;
CREATE POLICY "update_menu_categories" ON menu_categories FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager','kitchen']::member_role[]))
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner','manager','kitchen']::member_role[]));

DROP POLICY IF EXISTS "delete_menu_categories" ON menu_categories;
CREATE POLICY "delete_menu_categories" ON menu_categories FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager','kitchen']::member_role[]));

-- orders: Add kitchen to UPDATE (for preparation status: pending → preparing → ready)
DROP POLICY IF EXISTS "update_orders" ON orders;
CREATE POLICY "update_orders" ON orders FOR UPDATE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['manager','cashier','kitchen']::member_role[]))
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['manager','cashier','kitchen']::member_role[]));

-- storage.objects: Add kitchen to UPDATE and DELETE
DROP POLICY IF EXISTS "members_update_restaurant_assets" ON storage.objects;
CREATE POLICY "members_update_restaurant_assets" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'restaurant-assets'
    AND name LIKE 'restaurants/%'
    AND is_restaurant_member(
      split_part(name, '/', 2)::uuid,
      ARRAY['owner','manager','kitchen']::member_role[]
    )
  )
  WITH CHECK (
    bucket_id = 'restaurant-assets'
    AND name LIKE 'restaurants/%'
    AND is_restaurant_member(
      split_part(name, '/', 2)::uuid,
      ARRAY['owner','manager','kitchen']::member_role[]
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
      ARRAY['owner','manager','kitchen']::member_role[]
    )
  );
