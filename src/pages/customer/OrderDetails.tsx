import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle2, ChefHat, Package, UtensilsCrossed, XCircle } from 'lucide-react';
import { supabase } from '@/supabase/client';
import {
  fetchCustomerOrderDetail,
  type CustomerOrderDetail,
} from '@/services/customerService';
import type { OrderStatus } from '@/types';
import { Card, Badge, ErrorState, SkeletonCard } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

const statusVariant: Record<OrderStatus, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  pending: 'warning',
  preparing: 'info',
  ready: 'success',
  served: 'neutral',
  completed: 'success',
  cancelled: 'danger',
};

const statusSteps: { status: OrderStatus; label: string; icon: typeof Clock }[] = [
  { status: 'pending', label: 'Pending', icon: Clock },
  { status: 'preparing', label: 'Preparing', icon: ChefHat },
  { status: 'ready', label: 'Ready', icon: Package },
  { status: 'served', label: 'Served', icon: UtensilsCrossed },
  { status: 'completed', label: 'Completed', icon: CheckCircle2 },
];

function getStatusIndex(status: OrderStatus): number {
  if (status === 'cancelled') return -1;
  const idx = statusSteps.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : 0;
}

export default function CustomerOrderDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await fetchCustomerOrderDetail(id);
    if (res.error) { setError(res.error); }
    else if (!res.data) { setError('Order not found'); }
    else { setError(null); setOrder(res.data); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription for this specific order
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`customer-order-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, load]);

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4 max-w-2xl">
        <button onClick={() => navigate('/orders')} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 transition">
          <ArrowLeft className="w-4 h-4" /> Back to orders
        </button>
        <ErrorState message={error ?? 'Order not found'} onRetry={load} />
      </div>
    );
  }

  const currentIdx = getStatusIndex(order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={() => navigate('/orders')} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 transition">
        <ArrowLeft className="w-4 h-4" /> Back to orders
      </button>

      {/* Order header */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs text-stone-500">#{order.id.slice(0, 8)}</p>
            <h1 className="text-lg font-semibold text-stone-900 mt-0.5">{order.branches?.name ?? '—'}</h1>
            <p className="text-xs text-stone-500 mt-0.5">{formatDate(order.created_at)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={statusVariant[order.status]}>{order.status}</Badge>
            <Badge variant={order.payment_status === 'paid' ? 'success' : 'warning'}>{order.payment_status}</Badge>
          </div>
        </div>
      </Card>

      {/* Status timeline */}
      {!isCancelled ? (
        <Card className="p-5">
          <h2 className="font-semibold text-stone-900 text-sm mb-4">Order status</h2>
          <div className="flex items-center justify-between">
            {statusSteps.map((step, idx) => {
              const isDone = idx <= currentIdx;
              const isCurrent = idx === currentIdx;
              const Icon = step.icon;
              return (
                <div key={step.status} className="flex flex-col items-center flex-1 relative">
                  {idx < statusSteps.length - 1 && (
                    <div className={`absolute top-4 left-1/2 w-full h-0.5 ${idx < currentIdx ? 'bg-amber-500' : 'bg-stone-200'}`} />
                  )}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition ${
                      isDone ? 'bg-amber-500 text-stone-900' : 'bg-stone-100 text-stone-400'
                    } ${isCurrent ? 'ring-4 ring-amber-100' : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-xs mt-1.5 ${isDone ? 'font-medium text-stone-900' : 'text-stone-400'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-stone-900 text-sm">Order cancelled</p>
              <p className="text-xs text-stone-500">This order was cancelled by the restaurant.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Items */}
      <Card>
        <div className="px-4 py-3 border-b border-stone-100">
          <p className="font-semibold text-stone-900 text-sm">Items</p>
        </div>
        <div className="divide-y divide-stone-50">
          {order.order_items.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-stone-900">{item.quantity}x {item.menu_items?.name ?? 'Unknown item'}</p>
                <p className="text-xs text-stone-500 mt-0.5">{formatCurrency(item.unit_price)} each</p>
              </div>
              <span className="font-medium text-stone-900 shrink-0">{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Totals */}
      <Card className="p-5">
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-stone-500">Subtotal</span>
            <span className="text-stone-900">{formatCurrency(order.subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Discount</span>
              <span className="text-stone-900">{formatCurrency(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-stone-500">Tax</span>
            <span className="text-stone-900">{formatCurrency(order.tax)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-stone-100">
            <span className="font-semibold text-stone-900">Total</span>
            <span className="font-bold text-amber-700 text-lg">{formatCurrency(order.total)}</span>
          </div>
        </div>
      </Card>

      {/* Payment info */}
      <Card className="p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-500">Payment method</span>
          <span className="font-medium text-stone-900 capitalize">{order.payment_method ?? 'Not selected'}</span>
        </div>
        <p className="text-xs text-stone-400 mt-2">
          Payment is collected at the restaurant. This is not an online payment.
        </p>
      </Card>

      {/* Notes */}
      {order.notes && (
        <Card className="p-4">
          <p className="text-xs text-stone-500 font-medium mb-1">Order notes</p>
          <p className="text-sm text-stone-700">{order.notes}</p>
        </Card>
      )}
    </div>
  );
}
