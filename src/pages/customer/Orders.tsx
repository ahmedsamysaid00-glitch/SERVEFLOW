import { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, X, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  fetchCustomerOrders,
  type CustomerOrderRow,
} from '@/services/customerService';
import type { OrderStatus, PaymentStatus } from '@/types';
import { Card, Badge, EmptyState, ErrorState, SkeletonCard, Select, Pagination } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

const PAGE_SIZE = 10;

const statusVariant: Record<OrderStatus, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  pending: 'warning',
  preparing: 'info',
  ready: 'success',
  served: 'neutral',
  completed: 'success',
  cancelled: 'danger',
};

const payVariant: Record<PaymentStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  unpaid: 'warning',
  paid: 'success',
  refunded: 'danger',
  partially_paid: 'warning',
};

export default function CustomerOrders() {
  const [orders, setOrders] = useState<CustomerOrderRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const todayStr = new Date().toISOString().split('T')[0];
    let dateFrom: string | undefined;
    if (dateFilter === 'today') dateFrom = todayStr;
    else if (dateFilter === 'all') dateFrom = undefined;
    else if (dateFilter) dateFrom = dateFilter;
    else dateFrom = undefined; // default to all for customer

    const res = await fetchCustomerOrders(
      { status: statusFilter || undefined, dateFrom },
      page, PAGE_SIZE
    );
    if (res.error) { setError(res.error); setOrders([]); }
    else { setError(null); setOrders(res.data ?? []); setCount(res.count); }
    setLoading(false);
  }, [statusFilter, dateFilter, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 tracking-tight">My Orders</h1>
        <p className="text-stone-500 text-sm mt-0.5">Track your orders and their status</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="served">Served</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select value={dateFilter} onChange={(v) => { setDateFilter(v); setPage(1); }}>
          <option value="all">All dates</option>
          <option value="today">Today</option>
          <option value={new Date(Date.now() - 86400000).toISOString().split('T')[0]}>Yesterday</option>
          <option value={new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]}>Last 7 days</option>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No orders yet"
            description="Your orders will appear here once you place them."
            icon={<ShoppingBag className="w-6 h-6" />}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link key={order.id} to={`/orders/${order.id}`}>
              <Card className="p-4 hover:border-amber-300 hover:shadow-sm transition cursor-pointer">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-stone-500">#{order.id.slice(0, 8)}</p>
                    <p className="font-semibold text-stone-900 text-sm mt-0.5">{order.branches?.name ?? '—'}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={statusVariant[order.status]}>{order.status}</Badge>
                      <Badge variant={payVariant[order.payment_status]}>{order.payment_status}</Badge>
                    </div>
                    <span className="font-bold text-stone-900">{formatCurrency(order.total)}</span>
                    <Eye className="w-4 h-4 text-stone-400" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
