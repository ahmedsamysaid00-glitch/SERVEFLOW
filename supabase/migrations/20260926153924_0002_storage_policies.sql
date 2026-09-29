/*
# Storage RLS policies for restaurant-assets bucket

Allows authenticated users to upload/read objects, scoped so that only
members of a restaurant can manage that restaurant's assets. Asset paths
follow the convention: restaurants/<restaurant_id>/...
*/

-- Public read for menu/logo images (they are displayed on customer-facing menus)
DROP POLICY IF EXISTS "public_read_restaurant_assets" ON storage.objects;
CREATE POLICY "public_read_restaurant_assets" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'restaurant-assets');

-- Authenticated users can upload into the bucket. Path is expected to be
-- restaurants/<restaurant_id>/...  We verify membership via the prefix.
DROP POLICY IF EXISTS "members_upload_restaurant_assets" ON storage.objects;
CREATE POLICY "members_upload_restaurant_assets" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-assets'
    AND is_restaurant_member(
      split_part(name, '/', 2)::uuid
    )
  );

-- Owners/managers can update/delete assets for their restaurant.
DROP POLICY IF EXISTS "members_update_restaurant_assets" ON storage.objects;
CREATE POLICY "members_update_restaurant_assets" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'restaurant-assets'
    AND is_restaurant_member(
      split_part(name, '/', 2)::uuid,
      ARRAY['owner','manager']::member_role[]
    )
  )
  WITH CHECK (
    bucket_id = 'restaurant-assets'
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
    AND is_restaurant_member(
      split_part(name, '/', 2)::uuid,
      ARRAY['owner','manager']::member_role[]
    )
  );
