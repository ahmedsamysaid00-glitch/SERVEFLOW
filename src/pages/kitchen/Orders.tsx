import { useEffect, useState, useCallback } from 'react';
import { Clock, ChefHat, CheckCircle2, ArrowRight, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchKitchenOrders,
  fetchOrderItemsForKitchen,
  fetchCompletedOrders,
  updateOrderStatus,
  type KitchenOrderRow,
} from '@/services/kitchenService';
import type { OrderStatus } from '@/types';
import { Card, Badge, EmptyState, ErrorState, SkeletonCard, PageTitle, Pagination } from '@/components/ui';
import { supabase } from '@/supabase/client';
import { formatDate } from '@/lib/utils';

const PAGE_SIZE = 10;

interface OrderWithItems extends KitchenOrderRow {
  items: { id: string; quantity: number; menu_items: { name: string } | null }[];
}

export default function KitchenOrders() {
  const { restaurant, branch } = useAuth();
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedOrders, setCompletedOrders] = useState<KitchenOrderRow[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [completedPage, setCompletedPage] = useState(1);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadActiveOrders = useCallback(async () => {
    if (!restaurant || !branch) return;
    const res = await fetchKitchenOrders(restaurant.id, branch.id);
    if (res.error) { setError(res.error); return; }
    setError(null);
    const activeOrders = res.data ?? [];
    // Fetch items for each order
    const withItems: OrderWithItems[] = await Promise.all(
      activeOrders.map(async (o) => {
        const itemsRes = await fetchOrderItemsForKitchen(o.id);
        return { ...o, items: itemsRes.data ?? [] };
      })
    );
    setOrders(withItems);
    setLoading(false);
  }, [restaurant?.id, branch?.id]);

  const loadCompleted = useCallback(async () => {
    if (!restaurant || !branch) return;
    const res = await fetchCompletedOrders(restaurant.id, branch.id, completedPage, PAGE_SIZE);
    if (!res.error) {
      setCompletedOrders(res.data ?? []);
      setCompletedCount(res.count);
    }
  }, [restaurant?.id, branch?.id, completedPage]);

  useEffect(() => {
    loadActiveOrders();
    loadCompleted();
  }, [loadActiveOrders, loadCompleted]);

  useEffect(() => {
    if (!restaurant || !branch) return;
    const channel = supabase
      .channel('kitchen-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branch.id}` },
        () => { loadActiveOrders(); loadCompleted(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        () => loadActiveOrders()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurant?.id, branch?.id, loadActiveOrders, loadCompleted]);

  async function handleStatusUpdate(orderId: string, newStatus: OrderStatus) {
    setUpdating(orderId);
    const { error } = await updateOrderStatus(orderId, newStatus);
    if (error) { setError(error); }
    setUpdating(null);
    // Realtime will refresh the list
  }

  const pending = orders.filter((o) => o.status === 'pending');
  const preparing = orders.filter((o) => o.status === 'preparing');
  const ready = orders.filter((o) => o.status === 'ready');

  if (loading) {
    return (
      <div className="space-y-6">
        <PageTitle title="Orders" subtitle="Kitchen preparation queue" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageTitle title="Orders" subtitle="Kitchen preparation queue" />
        <ErrorState message={error} onRetry={loadActiveOrders} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Orders" subtitle="Kitchen preparation queue — updates in real-time" />

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No active orders"
            description="New orders will appear here automatically when they come in."
            icon={<ChefHat className="w-6 h-6" />}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pending column */}
          <OrderColumn
            title="Pending"
            icon={<Clock className="w-4 h-4" />}
            color="amber"
            orders={pending}
            updating={updating}
            onAdvance={(id) => handleStatusUpdate(id, 'preparing')}
            advanceLabel="Start preparing"
            advanceIcon={<ArrowRight className="w-3.5 h-3.5" />}
          />

          {/* Preparing column */}
          <OrderColumn
            title="Preparing"
            icon={<ChefHat className="w-4 h-4" />}
            color="blue"
            orders={preparing}
            updating={updating}
            onAdvance={(id) => handleStatusUpdate(id, 'ready')}
            advanceLabel="Mark ready"
            advanceIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          />

          {/* Ready column */}
          <OrderColumn
            title="Ready"
            icon={<CheckCircle2 className="w-4 h-4" />}
            color="emerald"
            orders={ready}
            updating={updating}
            onAdvance={(id) => handleStatusUpdate(id, 'completed')}
            advanceLabel="Complete"
            advanceIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          />
        </div>
      )}

      {/* Completed / cancelled history */}
      <Card>
        <div className="px-5 py-4 border-b border-stone-100">
          <h3 className="font-semibold text-stone-900 text-sm">Recent History</h3>
        </div>
        {completedOrders.length === 0 ? (
          <EmptyState title="No recent history" description="Completed and cancelled orders will appear here." icon={<ShoppingBag className="w-6 h-6" />} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                    <th className="text-left font-medium px-5 py-3">Order ID</th>
                    <th className="text-left font-medium px-5 py-3">Customer</th>
                    <th className="text-left font-medium px-5 py-3">Status</th>
                    <th className="text-left font-medium px-5 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {completedOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-stone-50/50">
                      <td className="px-5 py-3 font-mono text-xs text-stone-600">#{order.id.slice(0, 8)}</td>
                      <td className="px-5 py-3 text-stone-700">{order.customers?.full_name ?? 'Walk-in'}</td>
                      <td className="px-5 py-3">
                        <Badge variant={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'neutral'}>
                          {order.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-stone-500 text-xs whitespace-nowrap">{formatDate(order.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={completedPage}
              totalPages={Math.ceil(completedCount / PAGE_SIZE)}
              onPageChange={setCompletedPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function OrderColumn({
  title,
  icon,
  color,
  orders,
  updating,
  onAdvance,
  advanceLabel,
  advanceIcon,
}: {
  title: string;
  icon: React.ReactNode;
  color: 'amber' | 'blue' | 'emerald';
  orders: OrderWithItems[];
  updating: string | null;
  onAdvance: (id: string) => void;
  advanceLabel: string;
  advanceIcon: React.ReactNode;
}) {
  const colorMap = {
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', btn: 'bg-amber-500 hover:bg-amber-600' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', btn: 'bg-blue-500 hover:bg-blue-600' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', btn: 'bg-emerald-500 hover:bg-emerald-600' },
  };
  const c = colorMap[color];

  return (
    <div>
      <div className={`flex items-center gap-2 rounded-lg ${c.bg} ${c.border} border px-3 py-2 mb-3`}>
        {icon}
        <span className={`font-semibold text-sm ${c.text}`}>{title}</span>
        <span className={`ml-auto text-sm font-semibold ${c.text}`}>{orders.length}</span>
      </div>
      <div className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-4">No orders</p>
        ) : (
          orders.map((order) => (
            <Card key={order.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-stone-500">#{order.id.slice(0, 8)}</span>
                <span className="text-xs text-stone-400">{formatDate(order.created_at).split(',')[1]?.trim()}</span>
              </div>
              {order.customers?.full_name && (
                <p className="text-sm font-medium text-stone-900 mb-2">{order.customers.full_name}</p>
              )}
              <div className="space-y-1.5 mb-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-stone-900">{item.quantity}×</span>
                    <span className="text-stone-700">{item.menu_items?.name ?? 'Unknown item'}</span>
                  </div>
                ))}
              </div>
              {order.notes && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 mb-3">
                  <p className="text-xs text-amber-700 font-medium">Note: {order.notes}</p>
                </div>
              )}
              <button
                onClick={() => onAdvance(order.id)}
                disabled={updating === order.id}
                className={`w-full rounded-lg ${c.btn} text-white py-2 text-sm font-medium transition flex items-center justify-center gap-1.5 disabled:opacity-60`}
              >
                {updating === order.id ? 'Updating…' : advanceLabel}
                {updating !== order.id && advanceIcon}
              </button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
