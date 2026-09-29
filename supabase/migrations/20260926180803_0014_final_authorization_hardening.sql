/*
# 0014: Final authorization hardening

## 1. Protect order financial fields from Kitchen

RLS controls rows, not columns. The orders UPDATE policy allows both
manager and kitchen. A Kitchen user could call the Supabase REST API
directly and modify subtotal, tax, total, payment_status, etc.

Fix: Add a BEFORE UPDATE trigger that rejects changes to protected
columns when the caller is a Kitchen member (not Manager).

Manager retains full UPDATE access for legitimate order corrections.
Kitchen can only change `status` (and `updated_at` via trigger).

## 2. Protect cashier shifts from direct manipulation

The cashier_shifts UPDATE policy (cashier_id = auth.uid()) lets a cashier
modify any column on their own row, including expected_cash,
cash_difference, starting_cash, status, opened_at, closed_at, etc.

Fix: Remove direct cashier UPDATE entirely. The close_cashier_shift RPC
is the only mutation path for closing a shift. Shifts are opened via
INSERT (which is already constrained) and closed via the RPC.

## 3. Narrow menu RLS to Kitchen-only mutations

menu_items and menu_categories INSERT/UPDATE/DELETE policies currently
allow owner, manager, and kitchen. Per the ServeFlow permission model,
only Kitchen should mutate menu items and categories.

Fix: Replace the broad policies with kitchen-only policies.
SELECT policies remain unchanged (all staff + customer can read).
*/

-- ═══════════════════════════════════════════════════════════════════
-- 1. ORDER FINANCIAL FIELD PROTECTION TRIGGER
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION protect_order_fields_from_kitchen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_kitchen boolean := false;
BEGIN
  -- Check if the current user is a kitchen member for this order's branch
  SELECT EXISTS(
    SELECT 1 FROM restaurant_members m
    WHERE m.user_id = auth.uid()
      AND m.restaurant_id = NEW.restaurant_id
      AND m.branch_id = NEW.branch_id
      AND m.status = 'active'
      AND m.role = 'kitchen'
  ) INTO v_is_kitchen;

  -- If the caller is kitchen, enforce column restrictions
  IF v_is_kitchen THEN
    IF NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id THEN
      RAISE EXCEPTION 'Kitchen cannot modify restaurant_id';
    END IF;
    IF NEW.branch_id IS DISTINCT FROM OLD.branch_id THEN
      RAISE EXCEPTION 'Kitchen cannot modify branch_id';
    END IF;
    IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
      RAISE EXCEPTION 'Kitchen cannot modify customer_id';
    END IF;
    IF NEW.cashier_id IS DISTINCT FROM OLD.cashier_id THEN
      RAISE EXCEPTION 'Kitchen cannot modify cashier_id';
    END IF;
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
      RAISE EXCEPTION 'Kitchen cannot modify subtotal';
    END IF;
    IF NEW.discount IS DISTINCT FROM OLD.discount THEN
      RAISE EXCEPTION 'Kitchen cannot modify discount';
    END IF;
    IF NEW.tax IS DISTINCT FROM OLD.tax THEN
      RAISE EXCEPTION 'Kitchen cannot modify tax';
    END IF;
    IF NEW.total IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'Kitchen cannot modify total';
    END IF;
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'Kitchen cannot modify payment_status';
    END IF;
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      RAISE EXCEPTION 'Kitchen cannot modify payment_method';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Kitchen cannot modify created_at';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Kitchen cannot modify id';
    END IF;
    IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'Kitchen cannot modify idempotency_key';
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'Kitchen cannot modify notes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION protect_order_fields_from_kitchen() FROM anon;
REVOKE EXECUTE ON FUNCTION protect_order_fields_from_kitchen() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_order_fields ON orders;
CREATE TRIGGER trg_protect_order_fields
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION protect_order_fields_from_kitchen();

-- ═══════════════════════════════════════════════════════════════════
-- 2. REMOVE DIRECT CASHIER SHIFT UPDATE
-- ═══════════════════════════════════════════════════════════════════

-- Drop the broad cashier UPDATE policy. The close_cashier_shift RPC
-- (SECURITY DEFINER) is the only path to mutate a shift after creation.
-- The RPC already verifies ownership, computes expected_cash and
-- cash_difference server-side, and rejects double-close.
DROP POLICY IF EXISTS "update_cashier_shifts" ON cashier_shifts;

-- Note: INSERT and SELECT policies remain unchanged.
-- Cashier can still INSERT (open) their own shift and SELECT it.
-- Owner/Manager can still SELECT and DELETE.

-- ═══════════════════════════════════════════════════════════════════
-- 3. NARROW MENU ITEMS RLS TO KITCHEN-ONLY MUTATIONS
-- ═══════════════════════════════════════════════════════════════════

-- menu_items: INSERT → kitchen only
DROP POLICY IF EXISTS "insert_menu_items" ON menu_items;
CREATE POLICY "insert_menu_items" ON menu_items FOR INSERT
  TO authenticated
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['kitchen']::member_role[]));

-- menu_items: UPDATE → kitchen only
DROP POLICY IF EXISTS "update_menu_items" ON menu_items;
CREATE POLICY "update_menu_items" ON menu_items FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['kitchen']::member_role[]))
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['kitchen']::member_role[]));

-- menu_items: DELETE → kitchen only
DROP POLICY IF EXISTS "delete_menu_items" ON menu_items;
CREATE POLICY "delete_menu_items" ON menu_items FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['kitchen']::member_role[]));

-- ═══════════════════════════════════════════════════════════════════
-- 4. NARROW MENU CATEGORIES RLS TO KITCHEN-ONLY MUTATIONS
-- ═══════════════════════════════════════════════════════════════════

-- menu_categories: INSERT → kitchen only
DROP POLICY IF EXISTS "insert_menu_categories" ON menu_categories;
CREATE POLICY "insert_menu_categories" ON menu_categories FOR INSERT
  TO authenticated
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['kitchen']::member_role[]));

-- menu_categories: UPDATE → kitchen only
DROP POLICY IF EXISTS "update_menu_categories" ON menu_categories;
CREATE POLICY "update_menu_categories" ON menu_categories FOR UPDATE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['kitchen']::member_role[]))
  WITH CHECK (is_restaurant_member(restaurant_id, ARRAY['kitchen']::member_role[]));

-- menu_categories: DELETE → kitchen only
DROP POLICY IF EXISTS "delete_menu_categories" ON menu_categories;
CREATE POLICY "delete_menu_categories" ON menu_categories FOR DELETE
  TO authenticated
  USING (is_restaurant_member(restaurant_id, ARRAY['kitchen']::member_role[]));
