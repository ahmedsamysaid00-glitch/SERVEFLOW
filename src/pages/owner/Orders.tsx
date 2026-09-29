import { useState, useEffect } from 'react';
import { ShoppingBag } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import { fetchOrders, type OrdersQueryParams } from '@/services/ownerService';
import type { OrderStatus, PaymentStatus } from '@/types';
import { Card, Badge, EmptyState, ErrorState, SkeletonTable, Select, SearchInput, Pagination, PageTitle } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

const PAGE_SIZE = 15;

const orderStatusVariant: Record<OrderStatus, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  preparing: 'info',
  ready: 'info',
  served: 'neutral',
  completed: 'success',
  cancelled: 'danger',
};

const paymentStatusVariant: Record<PaymentStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  unpaid: 'warning',
  paid: 'success',
  refunded: 'danger',
  partially_paid: 'neutral',
};

export default function Orders() {
  const { restaurant } = useAuth();
  const { selectedBranchId } = useBranchFilter();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: typeof fetchOrders extends never ? never : any[]; count: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [selectedBranchId, search, statusFilter, paymentFilter]);

  useEffect(() => {
    if (!restaurant) return;
    let active = true;
    setLoading(true);
    const params: OrdersQueryParams = {
      restaurantId: restaurant.id,
      branchId: selectedBranchId,
      search: search || undefined,
      status: statusFilter || null,
      paymentStatus: paymentFilter || null,
      page,
      pageSize: PAGE_SIZE,
    };
    fetchOrders(params).then((result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error);
        setData(null);
      } else {
        setError(null);
        setData({ rows: result.data ?? [], count: result.count });
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [restaurant?.id, selectedBranchId, search, statusFilter, paymentFilter, page]);

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div className="space-y-5">
      <PageTitle title="Orders" subtitle="Monitor all orders across your branches" />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search order notes…" />
        <Select value={statusFilter} onChange={setStatusFilter}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="served">Served</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Select value={paymentFilter} onChange={setPaymentFilter}>
          <option value="">All payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="partially_paid">Partially paid</option>
          <option value="refunded">Refunded</option>
        </Select>
        <span className="text-sm text-stone-500 ml-auto">
          {data ? `${data.count} order${data.count !== 1 ? 's' : ''}` : ''}
        </span>
      </div>

      <Card>
        {loading ? (
          <SkeletonTable rows={6} columns={6} />
        ) : error ? (
          <ErrorState message={error} />
        ) : !data || data.rows.length === 0 ? (
          <EmptyState
            title="No orders found"
            description="Orders will appear here once customers start placing them."
            icon={<ShoppingBag className="w-6 h-6" />}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                    <th className="text-left font-medium px-5 py-3">Order ID</th>
                    <th className="text-left font-medium px-5 py-3">Branch</th>
                    <th className="text-left font-medium px-5 py-3">Customer</th>
                    <th className="text-left font-medium px-5 py-3">Status</th>
                    <th className="text-left font-medium px-5 py-3">Payment</th>
                    <th className="text-left font-medium px-5 py-3">Method</th>
                    <th className="text-right font-medium px-5 py-3">Total</th>
                    <th className="text-left font-medium px-5 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {data.rows.map((order) => (
                    <tr key={order.id} className="hover:bg-stone-50/50">
                      <td className="px-5 py-3 font-mono text-xs text-stone-600">
                        #{order.id.slice(0, 8)}
                      </td>
                      <td className="px-5 py-3 text-stone-700">{order.branches?.name ?? '—'}</td>
                      <td className="px-5 py-3 text-stone-700">
                        {order.customers?.full_name ?? 'Walk-in'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={orderStatusVariant[order.status as OrderStatus]}>
                          {order.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={paymentStatusVariant[order.payment_status as PaymentStatus]}>
                          {order.payment_status.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-stone-600 capitalize">
                        {order.payment_method ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-stone-900">
                        {formatCurrency(Number(order.total))}
                      </td>
                      <td className="px-5 py-3 text-stone-500 text-xs whitespace-nowrap">
                        {formatDate(order.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
