/*
# Audit fix: order_items DELETE policy — remove cashier

The order_items DELETE policy currently allows both manager and cashier.
A cashier could delete line items from an existing order, making stored
totals (orders.subtotal/tax/total) inconsistent with the actual items.

No code path performs a direct order_items DELETE — orders are cancelled
as a whole, not by deleting individual line items. Cashier has no
legitimate need for direct order_items DELETE.

Manager retains DELETE access for order corrections.
*/

DROP POLICY IF EXISTS "delete_order_items" ON order_items;
CREATE POLICY "delete_order_items" ON order_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND is_branch_member(o.restaurant_id, o.branch_id, ARRAY['manager']::member_role[])
    )
  );
