import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle2, CreditCard, Banknote, Receipt } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { createCustomerOrder } from '@/services/customerService';
import type { PaymentMethod } from '@/types';
import { Card, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

export default function CustomerCheckout() {
  const { cartList, cartBranch, subtotal, clearCart } = useCart();
  const navigate = useNavigate();
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ order_id: string; total: number } | null>(null);
  const idempotencyKeyRef = useRef<string>('');

  async function handleSubmit() {
    if (cartList.length === 0 || !cartBranch) return;
    setSubmitting(true);
    setError(null);

    // Generate a fresh idempotency key for this checkout attempt.
    // If the same request is retried (network failure, double-click),
    // the server returns the already-created order instead of a duplicate.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    const cartItems = cartList.map((entry) => ({
      menu_item_id: entry.item.id,
      quantity: entry.quantity,
    }));

    const res = await createCustomerOrder({
      branchId: cartBranch.id,
      cartItems,
      paymentMethod,
      notes: notes.trim() || null,
      idempotencyKey: idempotencyKeyRef.current,
    });

    setSubmitting(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setSuccess({ order_id: res.data!.order_id, total: res.data!.total });
    clearCart();
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold text-stone-900">Order placed!</h2>
          <p className="text-stone-500 mt-1">Order #{success.order_id.slice(0, 8)}</p>
          <div className="mt-4 rounded-lg bg-stone-50 p-3">
            <p className="text-stone-500 text-sm">Total</p>
            <p className="font-bold text-stone-900 text-lg">{formatCurrency(success.total)}</p>
          </div>
          <p className="text-xs text-stone-400 mt-3">
            Your order has been sent to the kitchen. Payment will be handled at the restaurant.
          </p>
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => navigate(`/orders/${success.order_id}`)}
              className="flex-1 rounded-lg bg-amber-500 text-stone-900 font-medium py-2.5 text-sm hover:bg-amber-400 transition"
            >
              Track order
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 rounded-lg border border-stone-200 text-stone-700 font-medium py-2.5 text-sm hover:bg-stone-50 transition"
            >
              Order more
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (cartList.length === 0) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/cart')} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 transition">
          <ArrowLeft className="w-4 h-4" /> Back to cart
        </button>
        <Card>
          <EmptyState
            title="Cart is empty"
            description="Add items to your cart before checkout."
            icon={<Receipt className="w-6 h-6" />}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <button onClick={() => navigate('/cart')} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 transition">
        <ArrowLeft className="w-4 h-4" /> Back to cart
      </button>

      <h1 className="text-xl font-semibold text-stone-900 tracking-tight">Checkout</h1>

      {/* Order summary */}
      <Card>
        <div className="px-4 py-3 border-b border-stone-100">
          <p className="font-semibold text-stone-900 text-sm">Order summary</p>
          <p className="text-xs text-stone-500">{cartBranch?.name} · {cartList.length} item{cartList.length > 1 ? 's' : ''}</p>
        </div>
        <div className="divide-y divide-stone-50">
          {cartList.map((entry) => (
            <div key={entry.item.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-stone-700">{entry.quantity}x {entry.item.name}</span>
              </div>
              <span className="font-medium text-stone-900 shrink-0">{formatCurrency(entry.item.price * entry.quantity)}</span>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-stone-100 flex items-center justify-between">
          <span className="font-semibold text-stone-700">Subtotal</span>
          <span className="text-lg font-bold text-stone-900">{formatCurrency(subtotal)}</span>
        </div>
      </Card>

      {/* Payment method */}
      <Card className="p-5">
        <p className="font-semibold text-stone-900 text-sm mb-3">Payment method preference</p>
        <p className="text-xs text-stone-500 mb-3">
          Select how you plan to pay. Payment is collected at the restaurant — this is not an online payment.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setPaymentMethod('cash')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition ${
              paymentMethod === 'cash' ? 'bg-amber-500 text-stone-900' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Banknote className="w-4 h-4" /> Cash
          </button>
          <button
            onClick={() => setPaymentMethod('card')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition ${
              paymentMethod === 'card' ? 'bg-amber-500 text-stone-900' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <CreditCard className="w-4 h-4" /> Card
          </button>
        </div>
      </Card>

      {/* Notes */}
      <Card className="p-5">
        <label className="block text-sm font-medium text-stone-700 mb-1.5">Order notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any special instructions for the kitchen…"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none resize-none"
        />
      </Card>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || cartList.length === 0}
        className="w-full rounded-lg bg-stone-900 text-white font-semibold py-3.5 text-sm hover:bg-stone-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Placing order…</>
        ) : (
          <>Place order — {formatCurrency(subtotal)}</>
        )}
      </button>
    </div>
  );
}
