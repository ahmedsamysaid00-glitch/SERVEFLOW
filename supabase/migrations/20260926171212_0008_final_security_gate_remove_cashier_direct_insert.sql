/*
# Final Security Gate: Remove cashier direct INSERT on orders + order_items

The cashier must ONLY create orders through the create_cashier_order RPC,
which validates branch membership, item availability, prices, totals,
and creates the order + order_items atomically.

The previous INSERT policies allowed cashier to directly INSERT into
orders and order_items, bypassing all RPC business rules (price
validation, availability checks, discount/tax validation, etc).

This migration:
1. Removes 'cashier' from the orders INSERT WITH CHECK policy.
   Keeps the customer self-order path (customers with user_id = auth.uid()).
   Keeps 'manager' for direct manager operations.
2. Removes 'cashier' from the order_items INSERT WITH CHECK policy.
   Keeps 'manager' for direct manager operations.

The create_cashier_order RPC is SECURITY DEFINER and bypasses RLS,
so cashier order creation through the RPC is unaffected.
*/

-- 1. orders INSERT: remove cashier, keep manager + customer self-order
DROP POLICY IF EXISTS "insert_orders" ON orders;
CREATE POLICY "insert_orders" ON orders FOR INSERT
  TO authenticated
  WITH CHECK (
    is_branch_member(restaurant_id, branch_id, ARRAY['manager']::member_role[])
    OR (
      EXISTS (
        SELECT 1 FROM customers c
        WHERE c.id = orders.customer_id
          AND c.user_id = auth.uid()
      )
    )
  );

-- 2. order_items INSERT: remove cashier, keep manager
DROP POLICY IF EXISTS "insert_order_items" ON order_items;
CREATE POLICY "insert_order_items" ON order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['manager']::member_role[])
    )
  );
