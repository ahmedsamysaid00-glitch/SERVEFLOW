import { useState, useEffect } from 'react';
import { ShoppingBag, ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchManagerOrders,
  fetchOrderItems,
  updateOrderStatus,
  type ManagerOrdersParams,
} from '@/services/managerService';
import type { OrderStatus, PaymentStatus } from '@/types';
import type { OrderWithRelations, OrderItemWithMenu } from '@/types/derived';
import {
  Card,
  Badge,
  EmptyState,
  ErrorState,
  SkeletonTable,
  Select,
  SearchInput,
  Pagination,
  PageTitle,
} from '@/components/ui';
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

// Statuses a manager can set — operational flow only
const statusFlow: { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'served', label: 'Served' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function ManagerOrders() {
  const { restaurant, branch } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OrderWithRelations[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithRelations | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemWithMenu[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [search, statusFilter, paymentFilter]);

  useEffect(() => {
    if (!restaurant || !branch) return;
    let active = true;
    setLoading(true);
    const params: ManagerOrdersParams = {
      restaurantId: restaurant.id,
      branchId: branch.id,
      search: search || undefined,
      status: statusFilter || null,
      paymentStatus: paymentFilter || null,
      page,
      pageSize: PAGE_SIZE,
    };
    fetchManagerOrders(params).then((res) => {
      if (!active) return;
      if (res.error) { setError(res.error); setRows([]); setCount(0); }
      else { setError(null); setRows(res.data ?? []); setCount(res.count); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [restaurant?.id, branch?.id, search, statusFilter, paymentFilter, page]);

  async function openOrderDetails(order: OrderWithRelations) {
    setSelectedOrder(order);
    setItemsLoading(true);
    const { data, error } = await fetchOrderItems(order.id);
    if (error) { setOrderItems([]); }
    else { setOrderItems(data ?? []); }
    setItemsLoading(false);
  }

  async function handleStatusChange(newStatus: OrderStatus) {
    if (!selectedOrder) return;
    setStatusUpdate('Updating…');
    const { error } = await updateOrderStatus(selectedOrder.id, newStatus);
    if (error) {
      setStatusUpdate(error);
      setTimeout(() => setStatusUpdate(null), 3000);
    } else {
      setSelectedOrder({ ...selectedOrder, status: newStatus });
      setRows((prev) => prev.map((o) => o.id === selectedOrder.id ? { ...o, status: newStatus } : o));
      setStatusUpdate('Status updated');
      setTimeout(() => setStatusUpdate(null), 2000);
    }
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <PageTitle title="Orders" subtitle={`Orders at ${branch?.name ?? 'your branch'}`} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search order notes…" />
        <Select value={statusFilter} onChange={setStatusFilter}>
          <option value="">All statuses</option>
          {statusFlow.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select value={paymentFilter} onChange={setPaymentFilter}>
          <option value="">All payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="partially_paid">Partially paid</option>
          <option value="refunded">Refunded</option>
        </Select>
        <span className="text-sm text-stone-500 ml-auto">
          {count} order{count !== 1 ? 's' : ''}
        </span>
      </div>

      <Card>
        {loading ? (
          <SkeletonTable rows={6} columns={6} />
        ) : error ? (
          <ErrorState message={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No orders found"
            description="Orders for your branch will appear here once customers start placing them."
            icon={<ShoppingBag className="w-6 h-6" />}
          />
        ) : (
          <>
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
                    <th className="text-left font-medium px-5 py-3">Created</th>
                    <th className="text-center font-medium px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {rows.map((order) => (
                    <tr
                      key={order.id}
                      className="hover:bg-stone-50/50 cursor-pointer"
                      onClick={() => openOrderDetails(order)}
                    >
                      <td className="px-5 py-3 font-mono text-xs text-stone-600">
                        #{order.id.slice(0, 8)}
                      </td>
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
                      <td className="px-5 py-3 text-center">
                        <ChevronRight className="w-4 h-4 text-stone-400" />
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

      {/* Order detail drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setSelectedOrder(null)} />
          <div className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-semibold text-stone-900">Order #{selectedOrder.id.slice(0, 8)}</h3>
                <p className="text-xs text-stone-500">{formatDate(selectedOrder.created_at)}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-stone-400 hover:text-stone-900 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Customer</span>
                  <span className="font-medium text-stone-900">
                    {selectedOrder.customers?.full_name ?? 'Walk-in'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Payment status</span>
                  <Badge variant={paymentStatusVariant[selectedOrder.payment_status as PaymentStatus]}>
                    {selectedOrder.payment_status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Payment method</span>
                  <span className="font-medium text-stone-900 capitalize">
                    {selectedOrder.payment_method ?? '—'}
                  </span>
                </div>
                {selectedOrder.notes && (
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Notes</span>
                    <span className="text-stone-700 text-right max-w-[60%]">{selectedOrder.notes}</span>
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-medium text-stone-700 mb-2">Items</p>
                {itemsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 bg-stone-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : orderItems.length === 0 ? (
                  <p className="text-sm text-stone-400">No items found</p>
                ) : (
                  <div className="space-y-2">
                    {orderItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-lg border border-stone-100 p-3">
                        {item.menu_items?.image_url ? (
                          <img src={item.menu_items.image_url} alt={item.menu_items.name} className="w-9 h-9 rounded-lg object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center text-stone-400">
                            <ShoppingBag className="w-4 h-4" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-stone-900 text-sm truncate">
                            {item.menu_items?.name ?? 'Unknown item'}
                          </p>
                          <p className="text-xs text-stone-500">
                            {item.quantity} × {formatCurrency(Number(item.unit_price))}
                          </p>
                        </div>
                        <span className="font-medium text-stone-900 text-sm">
                          {formatCurrency(Number(item.subtotal))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5 border-t border-stone-100 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Subtotal</span>
                  <span className="text-stone-700">{formatCurrency(Number(selectedOrder.subtotal))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Discount</span>
                  <span className="text-stone-700">-{formatCurrency(Number(selectedOrder.discount))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Tax</span>
                  <span className="text-stone-700">{formatCurrency(Number(selectedOrder.tax))}</span>
                </div>
                <div className="flex justify-between font-semibold text-stone-900 pt-1">
                  <span>Total</span>
                  <span>{formatCurrency(Number(selectedOrder.total))}</span>
                </div>
              </div>

              {/* Status update controls */}
              <div className="border-t border-stone-100 pt-4">
                <p className="text-sm font-medium text-stone-700 mb-2">Update order status</p>
                <div className="flex flex-wrap gap-2">
                  {statusFlow.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => handleStatusChange(s.value)}
                      disabled={selectedOrder.status === s.value}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        selectedOrder.status === s.value
                          ? 'bg-stone-900 text-white'
                          : 'border border-stone-200 text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {statusUpdate && (
                  <p className="text-xs text-stone-500 mt-2">{statusUpdate}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
