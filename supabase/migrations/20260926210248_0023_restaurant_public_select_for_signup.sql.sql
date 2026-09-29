-- Allow any authenticated user to see active restaurants (for customer signup restaurant picker).
-- This is safe: restaurant name and id are public information.
CREATE POLICY "select_restaurants_for_signup"
  ON restaurants FOR SELECT
  TO authenticated
  USING (status = 'active');
