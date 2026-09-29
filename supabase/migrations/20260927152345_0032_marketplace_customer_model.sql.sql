/*
# Marketplace: make customers.restaurant_id nullable + update customer RLS

## Why
The customer model currently permanently links each customer to one restaurant
via customers.restaurant_id (NOT NULL). The marketplace model requires customers
to browse and order from ANY active restaurant. The restaurant_id on the customer
record is no longer the source of truth for which restaurant a customer is
ordering from — that's now determined per-order by the branch the customer
selects.

## Changes
1. ALTER TABLE customers ALTER COLUMN restaurant_id DROP NOT NULL
   — allows customer signup without selecting a restaurant
2. Replace customer-scoped SELECT policies on branches, menu_items,
   menu_categories, branch_menu_items with marketplace policies that allow
   any authenticated user with an active customer record to read data from
   ALL active restaurants (not just their assigned one).
3. Update customers INSERT policy to allow self-insert with nullable
   restaurant_id.
4. Update customers SELECT/UPDATE policies to work with nullable restaurant_id.

## Security
- Customers can only read active restaurants and active branches.
- Menu items are only visible if they belong to an active restaurant.
- branch_menu_items are only visible if the branch is active.
- Orders remain scoped to the customer via customer_id (unchanged).
- No service_role keys exposed. No RLS bypassed.
*/

-- 1. Make restaurant_id nullable on customers
ALTER TABLE customers ALTER COLUMN restaurant_id DROP NOT NULL;

-- 2. Update customers RLS policies for nullable restaurant_id

-- Drop old customer policies that assumed restaurant_id was always set
DROP POLICY IF EXISTS "select_customers" ON customers;
DROP POLICY IF EXISTS "insert_customers" ON customers;
DROP POLICY IF EXISTS "update_customers" ON customers;

-- Customers can read their own record (self only)
CREATE POLICY "select_own_customer" ON customers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Customers can insert their own record (self only, no restaurant required)
CREATE POLICY "insert_own_customer" ON customers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Customers can update their own record (self only)
CREATE POLICY "update_own_customer" ON customers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Restaurant staff can still see/update customers for their restaurant
-- (restaurant_id may be NULL for marketplace customers, so we use COALESCE)
CREATE POLICY "select_staff_customers" ON customers FOR SELECT
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner'::member_role, 'manager'::member_role, 'cashier'::member_role]));

CREATE POLICY "update_staff_customers" ON customers FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner'::member_role, 'manager'::member_role]))
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner'::member_role, 'manager'::member_role]));

CREATE POLICY "delete_staff_customers" ON customers FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner'::member_role, 'manager'::member_role]));

-- 3. Update branches RLS: customers can see ALL active branches of active restaurants
DROP POLICY IF EXISTS "select_branches_customer" ON branches;
CREATE POLICY "select_branches_customer_marketplace" ON branches FOR SELECT
  TO authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = branches.restaurant_id AND r.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.user_id = auth.uid() AND c.status = 'active'
    )
  );

-- 4. Update menu_categories RLS: customers can see ALL active categories from active restaurants
DROP POLICY IF EXISTS "select_menu_categories_customer" ON menu_categories;
CREATE POLICY "select_menu_categories_customer_marketplace" ON menu_categories FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = menu_categories.restaurant_id AND r.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.user_id = auth.uid() AND c.status = 'active'
    )
  );

-- 5. Update menu_items RLS: customers can see ALL items from active restaurants
DROP POLICY IF EXISTS "select_menu_items_customer" ON menu_items;
CREATE POLICY "select_menu_items_customer_marketplace" ON menu_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = menu_items.restaurant_id AND r.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.user_id = auth.uid() AND c.status = 'active'
    )
  );

-- 6. Update branch_menu_items RLS: customers can see available items at active branches
DROP POLICY IF EXISTS "select_branch_menu_items_customer" ON branch_menu_items;
CREATE POLICY "select_branch_menu_items_customer_marketplace" ON branch_menu_items FOR SELECT
  TO authenticated
  USING (
    is_available = true
    AND EXISTS (
      SELECT 1 FROM branches b
      WHERE b.id = branch_menu_items.branch_id AND b.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.id = (
        SELECT b2.restaurant_id FROM branches b2 WHERE b2.id = branch_menu_items.branch_id
      ) AND r.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.user_id = auth.uid() AND c.status = 'active'
    )
  );
