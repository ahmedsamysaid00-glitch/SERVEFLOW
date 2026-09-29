import { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, X, Eye, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchCashierOrders, fetchOrderDetail,
  type CashierOrderRow, type OrderDetailRow,
} from '@/services/cashierService';
import type { OrderStatus, PaymentStatus } from '@/types';
import { Card, Badge, EmptyState, ErrorState, SkeletonCard, PageTitle, Select, Pagination } from '@/components/ui';
import { supabase } from '@/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils';

const PAGE_SIZE = 15;

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

export default function CashierOrders() {
  const { restaurant, branch } = useAuth();
  const [orders, setOrders] = useState<CashierOrderRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [search, setSearch] = useState('');
  const [detailOrder, setDetailOrder] = useState<OrderDetailRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!restaurant || !branch) return;
    setLoading(true);
    const todayStr = new Date().toISOString().split('T')[0];
    let dateFrom: string | undefined;
    if (dateFilter === 'today') dateFrom = todayStr;
    else if (dateFilter === 'all') dateFrom = undefined;
    else if (dateFilter) dateFrom = dateFilter;
    else dateFrom = todayStr; // default to today
    const res = await fetchCashierOrders(
      restaurant.id, branch.id,
      {
        status: statusFilter || undefined,
        paymentStatus: paymentFilter || undefined,
        dateFrom,
        search: search || undefined,
      },
      page, PAGE_SIZE
    );
    if (res.error) { setError(res.error); setOrders([]); }
    else { setError(null); setOrders(res.data ?? []); setCount(res.count); }
    setLoading(false);
  }, [restaurant?.id, branch?.id, statusFilter, paymentFilter, dateFilter, search, page]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!restaurant || !branch) return;
    const channel = supabase
      .channel('cashier-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branch.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurant?.id, branch?.id, load]);

  async function viewOrder(orderId: string) {
    if (!branch) return;
    setDetailLoading(true);
    const res = await fetchOrderDetail(orderId, branch.id);
    if (res.error) { setError(res.error); }
    else { setDetailOrder(res.data); }
    setDetailLoading(false);
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <PageTitle title="Orders" subtitle="All orders from your branch" />

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
        <Select value={paymentFilter} onChange={(v) => { setPaymentFilter(v); setPage(1); }}>
          <option value="">All payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="partially_paid">Partially paid</option>
          <option value="refunded">Refunded</option>
        </Select>
        <Select value={dateFilter} onChange={(v) => { setDateFilter(v); setPage(1); }}>
          <option value="today">Today</option>
          <option value="all">All dates</option>
          <option value={new Date(Date.now() - 86400000).toISOString().split('T')[0]}>Yesterday</option>
          <option value={new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]}>Last 7 days</option>
        </Select>
        <input
          type="text" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search order ID or customer…"
          className="flex-1 min-w-[180px] rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No orders found"
            description="Orders from your branch will appear here."
            icon={<ShoppingBag className="w-6 h-6" />}
          />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-3">Order ID</th>
                  <th className="text-left font-medium px-5 py-3">Customer</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                  <th className="text-left font-medium px-5 py-3">Payment</th>
                  <th className="text-left font-medium px-5 py-3">Method</th>
                  <th className="text-right font-medium px-5 py-3">Total</th>
                  <th className="text-left font-medium px-5 py-3">Time</th>
                  <th className="text-center font-medium px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-stone-50/50 cursor-pointer" onClick={() => viewOrder(order.id)}>
                    <td className="px-5 py-3 font-mono text-xs text-stone-600">#{order.id.slice(0, 8)}</td>
                    <td className="px-5 py-3 text-stone-700">{order.customers?.full_name ?? 'Guest'}</td>
                    <td className="px-5 py-3"><Badge variant={statusVariant[order.status]}>{order.status}</Badge></td>
                    <td className="px-5 py-3"><Badge variant={payVariant[order.payment_status]}>{order.payment_status}</Badge></td>
                    <td className="px-5 py-3 text-stone-600 capitalize">{order.payment_method ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatCurrency(order.total)}</td>
                    <td className="px-5 py-3 text-stone-500 text-xs whitespace-nowrap">{formatDate(order.created_at)}</td>
                    <td className="px-5 py-3 text-center">
                      <button className="text-stone-400 hover:text-teal-600 transition"><Eye className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </Card>
      )}

      {/* Order detail modal */}
      {(detailOrder || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => { setDetailOrder(null); }} />
          <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-2 border-stone-300 border-t-teal-500 rounded-full animate-spin" />
              </div>
            ) : detailOrder ? (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white z-10">
                  <div>
                    <h3 className="font-semibold text-stone-900">Order #{detailOrder.id.slice(0, 8)}</h3>
                    <p className="text-xs text-stone-500">{formatDate(detailOrder.created_at)}</p>
                  </div>
                  <button onClick={() => setDetailOrder(null)} className="text-stone-400 hover:text-stone-900"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={statusVariant[detailOrder.status]}>{detailOrder.status}</Badge>
                    <Badge variant={payVariant[detailOrder.payment_status]}>{detailOrder.payment_status}</Badge>
                    {detailOrder.payment_method && (
                      <Badge variant="neutral">{detailOrder.payment_method}</Badge>
                    )}
                  </div>

                  <div className="text-sm">
                    <p className="text-stone-500">Customer</p>
                    <p className="font-medium text-stone-900">{detailOrder.customers?.full_name ?? 'Guest'}</p>
                  </div>

                  <div>
                    <p className="text-sm text-stone-500 mb-2">Items</p>
                    <div className="space-y-2">
                      {detailOrder.order_items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-900">{item.quantity}×</span>
                            <span className="text-stone-700">{item.menu_items?.name ?? 'Unknown item'}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-stone-500 text-xs">{formatCurrency(item.unit_price)} each</p>
                            <p className="font-medium text-stone-900">{formatCurrency(item.subtotal)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {detailOrder.notes && (
                    <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                      <p className="text-xs text-amber-700"><span className="font-medium">Notes:</span> {detailOrder.notes}</p>
                    </div>
                  )}

                  <div className="space-y-1 border-t border-stone-100 pt-3">
                    <div className="flex justify-between text-sm"><span className="text-stone-500">Subtotal</span><span className="text-stone-900">{formatCurrency(detailOrder.subtotal)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-stone-500">Discount</span><span className="text-stone-900">{formatCurrency(detailOrder.discount)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-stone-500">Tax</span><span className="text-stone-900">{formatCurrency(detailOrder.tax)}</span></div>
                    <div className="flex justify-between pt-1"><span className="font-semibold text-stone-900">Total</span><span className="font-bold text-teal-700">{formatCurrency(detailOrder.total)}</span></div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
