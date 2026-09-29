/*
# ServeFlow Foundation — Multi-Tenant Restaurant SaaS (fix cast types)

Re-applies the full schema with explicit member_role[] casts on array
literals passed to the membership helper functions, so Postgres resolves
the correct function signature.
*/

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE restaurant_status AS ENUM ('active', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('owner', 'manager', 'kitchen', 'cashier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_status AS ENUM ('active', 'invited', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE branch_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'preparing', 'ready', 'served', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'refunded', 'partially_paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'card', 'online', 'wallet', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_tx_type AS ENUM ('purchase', 'consumption', 'adjustment', 'waste', 'transfer_in', 'transfer_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE customer_status AS ENUM ('active', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- TABLES — CORE TENANT
-- ============================================================================

CREATE TABLE IF NOT EXISTS restaurants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  logo_url    text,
  phone       text,
  email       text UNIQUE,
  status      restaurant_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  address       text,
  phone         text,
  status        branch_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  phone       text,
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role          member_role NOT NULL,
  status        member_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (role = 'owner' AND branch_id IS NULL)
    OR (role IN ('manager', 'kitchen', 'cashier') AND branch_id IS NOT NULL)
  )
);

-- ============================================================================
-- TABLES — MENU
-- ============================================================================

CREATE TABLE IF NOT EXISTS menu_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  image_url     text,
  sort_order    int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  image_url     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

CREATE TABLE IF NOT EXISTS branch_menu_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  price        numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_available boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, menu_item_id)
);

-- ============================================================================
-- TABLES — CUSTOMERS & ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  full_name     text,
  phone         text,
  email         text,
  status        customer_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id      uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id    uuid REFERENCES customers(id) ON DELETE SET NULL,
  cashier_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status         order_status NOT NULL DEFAULT 'pending',
  subtotal       numeric(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount       numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax            numeric(10,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total          numeric(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  payment_method payment_method,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
  quantity     int NOT NULL CHECK (quantity > 0),
  unit_price   numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  subtotal     numeric(10,2) NOT NULL CHECK (subtotal >= 0)
);

-- ============================================================================
-- TABLES — INVENTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id      uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name           text NOT NULL,
  unit           text NOT NULL,
  quantity       numeric(12,3) NOT NULL DEFAULT 0,
  minimum_quantity numeric(12,3) NOT NULL DEFAULT 0,
  cost_per_unit  numeric(10,2) NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, branch_id, name)
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id        uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type             inventory_tx_type NOT NULL,
  quantity         numeric(12,3) NOT NULL,
  reason           text,
  created_by       uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_branches_restaurant ON branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_members_restaurant ON restaurant_members(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_members_branch ON restaurant_members(branch_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON restaurant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON menu_categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_branch_menu_items_branch ON branch_menu_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_menu_items_item ON branch_menu_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_cashier ON orders(cashier_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_restaurant ON inventory_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_branch ON inventory_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_restaurant ON inventory_transactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_branch ON inventory_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tx_item ON inventory_transactions(inventory_item_id);

-- ============================================================================
-- updated_at TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_branch_menu_items_updated_at
    BEFORE UPDATE ON branch_menu_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_inventory_items_updated_at
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- MEMBERSHIP HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_restaurant_member(
  p_restaurant_id uuid,
  p_roles member_role[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM restaurant_members
    WHERE user_id = auth.uid()
      AND restaurant_id = p_restaurant_id
      AND status = 'active'
      AND (p_roles IS NULL OR role = ANY(p_roles))
  );
$$;

CREATE OR REPLACE FUNCTION is_branch_member(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_roles member_role[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM restaurant_members m
    WHERE m.user_id = auth.uid()
      AND m.restaurant_id = p_restaurant_id
      AND m.status = 'active'
      AND (p_roles IS NULL OR m.role = ANY(p_roles))
      AND (
        m.role = 'owner'
        OR m.branch_id = p_branch_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION accessible_branches(p_restaurant_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id
  FROM branches b
  JOIN restaurant_members m
    ON m.restaurant_id = b.restaurant_id
  WHERE m.user_id = auth.uid()
    AND m.restaurant_id = p_restaurant_id
    AND m.status = 'active'
    AND (m.role = 'owner' OR m.branch_id = b.id);
$$;

REVOKE EXECUTE ON FUNCTION is_restaurant_member(uuid, member_role[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION is_branch_member(uuid, uuid, member_role[]) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION accessible_branches(uuid) FROM anon, authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- restaurants
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_restaurant" ON restaurants;
CREATE POLICY "select_own_restaurant" ON restaurants FOR SELECT
  TO authenticated
  USING (is_restaurant_member(id));

DROP POLICY IF EXISTS "update_own_restaurant" ON restaurants;
CREATE POLICY "update_own_restaurant" ON restaurants FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(id, ARRAY['owner']::member_role[]))
  WITH CHECK (is_restaurant_member(id, ARRAY['owner']::member_role[]));

-- branches
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_branches" ON branches;
CREATE POLICY "select_branches" ON branches FOR SELECT
  TO authenticated
  USING (is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "insert_branches" ON branches;
CREATE POLICY "insert_branches" ON branches FOR INSERT
  TO authenticated
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner']::member_role[]));

DROP POLICY IF EXISTS "update_branches" ON branches;
CREATE POLICY "update_branches" ON branches FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]))
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]));

DROP POLICY IF EXISTS "delete_branches" ON branches;
CREATE POLICY "delete_branches" ON branches FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner']::member_role[]));

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- restaurant_members
ALTER TABLE restaurant_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_members" ON restaurant_members;
CREATE POLICY "select_members" ON restaurant_members FOR SELECT
  TO authenticated
  USING (is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "insert_members" ON restaurant_members;
CREATE POLICY "insert_members" ON restaurant_members FOR INSERT
  TO authenticated
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner']::member_role[]));

DROP POLICY IF EXISTS "update_members" ON restaurant_members;
CREATE POLICY "update_members" ON restaurant_members FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner']::member_role[]))
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner']::member_role[]));

DROP POLICY IF EXISTS "delete_members" ON restaurant_members;
CREATE POLICY "delete_members" ON restaurant_members FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner']::member_role[]));

-- menu_categories
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_menu_categories" ON menu_categories;
CREATE POLICY "select_menu_categories" ON menu_categories FOR SELECT
  TO authenticated
  USING (is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "insert_menu_categories" ON menu_categories;
CREATE POLICY "insert_menu_categories" ON menu_categories FOR INSERT
  TO authenticated
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]));

DROP POLICY IF EXISTS "update_menu_categories" ON menu_categories;
CREATE POLICY "update_menu_categories" ON menu_categories FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]))
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]));

DROP POLICY IF EXISTS "delete_menu_categories" ON menu_categories;
CREATE POLICY "delete_menu_categories" ON menu_categories FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]));

-- menu_items
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_menu_items" ON menu_items;
CREATE POLICY "select_menu_items" ON menu_items FOR SELECT
  TO authenticated
  USING (is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "insert_menu_items" ON menu_items;
CREATE POLICY "insert_menu_items" ON menu_items FOR INSERT
  TO authenticated
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]));

DROP POLICY IF EXISTS "update_menu_items" ON menu_items;
CREATE POLICY "update_menu_items" ON menu_items FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]))
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]));

DROP POLICY IF EXISTS "delete_menu_items" ON menu_items;
CREATE POLICY "delete_menu_items" ON menu_items FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]));

-- branch_menu_items
ALTER TABLE branch_menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_branch_menu_items" ON branch_menu_items;
CREATE POLICY "select_branch_menu_items" ON branch_menu_items FOR SELECT
  TO authenticated
  USING (is_branch_member(
    (SELECT mi.restaurant_id FROM menu_items mi WHERE mi.id = branch_menu_items.menu_item_id),
    branch_id,
    ARRAY['owner','manager','kitchen','cashier']::member_role[]
  ));

DROP POLICY IF EXISTS "insert_branch_menu_items" ON branch_menu_items;
CREATE POLICY "insert_branch_menu_items" ON branch_menu_items FOR INSERT
  TO authenticated
  WITH CHECK (is_branch_member(
    (SELECT mi.restaurant_id FROM menu_items mi WHERE mi.id = branch_menu_items.menu_item_id),
    branch_id,
    ARRAY['owner','manager','kitchen']::member_role[]
  ));

DROP POLICY IF EXISTS "update_branch_menu_items" ON branch_menu_items;
CREATE POLICY "update_branch_menu_items" ON branch_menu_items FOR UPDATE
  TO authenticated
  USING (is_branch_member(
    (SELECT mi.restaurant_id FROM menu_items mi WHERE mi.id = branch_menu_items.menu_item_id),
    branch_id,
    ARRAY['owner','manager','kitchen']::member_role[]
  ))
  WITH CHECK (is_branch_member(
    (SELECT mi.restaurant_id FROM menu_items mi WHERE mi.id = branch_menu_items.menu_item_id),
    branch_id,
    ARRAY['owner','manager','kitchen']::member_role[]
  ));

DROP POLICY IF EXISTS "delete_branch_menu_items" ON branch_menu_items;
CREATE POLICY "delete_branch_menu_items" ON branch_menu_items FOR DELETE
  TO authenticated
  USING (is_branch_member(
    (SELECT mi.restaurant_id FROM menu_items mi WHERE mi.id = branch_menu_items.menu_item_id),
    branch_id,
    ARRAY['owner','manager','kitchen']::member_role[]
  ));

-- customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_customers" ON customers;
CREATE POLICY "select_customers" ON customers FOR SELECT
  TO authenticated
  USING (
    is_restaurant_member(restaurant_id, ARRAY['owner','manager','cashier']::member_role[])
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "insert_customers" ON customers;
CREATE POLICY "insert_customers" ON customers FOR INSERT
  TO authenticated
  WITH CHECK (
    is_restaurant_member(restaurant_id, ARRAY['owner','manager','cashier']::member_role[])
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "update_customers" ON customers;
CREATE POLICY "update_customers" ON customers FOR UPDATE
  TO authenticated
  USING (
    is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[])
    OR auth.uid() = user_id
  )
  WITH CHECK (
    is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[])
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS "delete_customers" ON customers;
CREATE POLICY "delete_customers" ON customers FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['owner','manager']::member_role[]));

-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_orders" ON orders;
CREATE POLICY "select_orders" ON orders FOR SELECT
  TO authenticated
  USING (
    is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','kitchen','cashier']::member_role[])
    OR EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = orders.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_orders" ON orders;
CREATE POLICY "insert_orders" ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','cashier']::member_role[])
    OR EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = orders.customer_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_orders" ON orders;
CREATE POLICY "update_orders" ON orders FOR UPDATE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','cashier']::member_role[]))
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','cashier']::member_role[]));

DROP POLICY IF EXISTS "delete_orders" ON orders;
CREATE POLICY "delete_orders" ON orders FOR DELETE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager']::member_role[]));

-- order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_order_items" ON order_items;
CREATE POLICY "select_order_items" ON order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND (
          is_branch_member(o.restaurant_id, o.branch_id, ARRAY['owner','manager','kitchen','cashier']::member_role[])
          OR EXISTS (
            SELECT 1 FROM customers c
            WHERE c.id = o.customer_id AND c.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "insert_order_items" ON order_items;
CREATE POLICY "insert_order_items" ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['owner','manager','cashier']::member_role[])
    )
  );

DROP POLICY IF EXISTS "update_order_items" ON order_items;
CREATE POLICY "update_order_items" ON order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['owner','manager','cashier']::member_role[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['owner','manager','cashier']::member_role[])
    )
  );

DROP POLICY IF EXISTS "delete_order_items" ON order_items;
CREATE POLICY "delete_order_items" ON order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['owner','manager','cashier']::member_role[])
    )
  );

-- inventory_items
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inventory_items" ON inventory_items;
CREATE POLICY "select_inventory_items" ON inventory_items FOR SELECT
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','kitchen','cashier']::member_role[]));

DROP POLICY IF EXISTS "insert_inventory_items" ON inventory_items;
CREATE POLICY "insert_inventory_items" ON inventory_items FOR INSERT
  TO authenticated
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','kitchen']::member_role[]));

DROP POLICY IF EXISTS "update_inventory_items" ON inventory_items;
CREATE POLICY "update_inventory_items" ON inventory_items FOR UPDATE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','kitchen']::member_role[]))
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','kitchen']::member_role[]));

DROP POLICY IF EXISTS "delete_inventory_items" ON inventory_items;
CREATE POLICY "delete_inventory_items" ON inventory_items FOR DELETE
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager']::member_role[]));

-- inventory_transactions
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_inventory_tx" ON inventory_transactions;
CREATE POLICY "select_inventory_tx" ON inventory_transactions FOR SELECT
  TO authenticated
  USING (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','kitchen','cashier']::member_role[]));

DROP POLICY IF EXISTS "insert_inventory_tx" ON inventory_transactions;
CREATE POLICY "insert_inventory_tx" ON inventory_transactions FOR INSERT
  TO authenticated
  WITH CHECK (is_branch_member(restaurant_id, branch_id, ARRAY['owner','manager','kitchen']::member_role[]));

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-assets', 'restaurant-assets', true)
ON CONFLICT (id) DO NOTHING;
