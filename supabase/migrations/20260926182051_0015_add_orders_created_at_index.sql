/*
# 0015: Add orders.created_at index

Nearly every orders query sorts by created_at DESC and/or filters
by created_at range (date filters in cashier/manager/owner Orders
pages, reports date-range queries). No index covered this column.

This composite index on (branch_id, created_at DESC) serves the
most common pattern: "orders for this branch, newest first."
Single-column branch_id index already exists, but this composite
avoids the sort step for paginated branch queries.
*/
CREATE INDEX IF NOT EXISTS idx_orders_branch_created_at
  ON public.orders (branch_id, created_at DESC);
