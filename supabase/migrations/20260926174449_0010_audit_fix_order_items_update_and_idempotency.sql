/*
# Audit fix 1: Remove cashier from order_items UPDATE policy

The order_items UPDATE policy currently allows both `manager` and `cashier`
roles. No code path in the application performs a direct order_items UPDATE —
all order_items are created through RPCs (create_cashier_order,
create_customer_order). Allowing cashier to directly UPDATE order_items is a
security gap: a cashier could modify quantity, unit_price, subtotal, or
menu_item_id on existing orders, making stored totals inconsistent with the
parent orders.subtotal/tax/total.

Cashier has no legitimate production need for direct order_items UPDATE.
Manager retains UPDATE access for order corrections (e.g., kitchen adjusting
items during preparation).

# Audit fix 2: Add idempotency key column to orders

Add an `idempotency_key` column to the orders table with a UNIQUE constraint.
The create_customer_order RPC accepts an idempotency key from the client.
If the same key is submitted again, the RPC returns the already-created order
instead of creating a duplicate.

The key is scoped per-customer: the UNIQUE constraint is on
(customer_id, idempotency_key), so one customer cannot reuse another
customer's key to access their order.
*/

-- ─── 1. Remove cashier from order_items UPDATE ──────────────────────────────

DROP POLICY IF EXISTS "update_order_items" ON order_items;
CREATE POLICY "update_order_items" ON order_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['manager']::member_role[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['manager']::member_role[])
    )
  );

-- ─── 2. Add idempotency_key to orders ───────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Unique constraint scoped per customer: same key can only map to one order
-- per customer. NULL keys are allowed (multiple NULLs don't conflict).
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_unique
  ON orders (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
