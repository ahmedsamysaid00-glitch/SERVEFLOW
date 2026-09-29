import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, MapPin } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { Card, EmptyState } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

export default function CustomerCart() {
  const { cartList, cartBranch, subtotal, increment, decrement, removeFromCart, clearCart } = useCart();
  const navigate = useNavigate();

  if (cartList.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-stone-900 tracking-tight">Your cart</h1>
        <Card>
          <EmptyState
            title="Cart is empty"
            description="Browse the menu and add items to your cart."
            icon={<ShoppingCart className="w-6 h-6" />}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900 tracking-tight">Your cart</h1>
        <button
          onClick={() => { clearCart(); navigate('/'); }}
          className="text-sm text-stone-400 hover:text-red-600 transition"
        >
          Clear cart
        </button>
      </div>

      {/* Branch indicator */}
      <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
        <MapPin className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-800">Ordering from: {cartBranch?.name ?? '—'}</span>
      </div>

      <Card>
        <div className="divide-y divide-stone-50">
          {cartList.map((entry) => (
            <div key={entry.item.id} className="flex items-center gap-3 p-4">
              <div className="w-12 h-12 rounded-lg bg-stone-100 overflow-hidden shrink-0">
                {entry.item.image_url ? (
                  <img src={entry.item.image_url} alt={entry.item.name} className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-stone-900 text-sm truncate">{entry.item.name}</p>
                <p className="text-xs text-stone-500">{formatCurrency(entry.item.price)} each</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => decrement(entry.item.id)}
                  className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600 hover:bg-stone-200 transition"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-7 text-center text-sm font-semibold text-stone-900">{entry.quantity}</span>
                <button
                  onClick={() => increment(entry.item.id)}
                  className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600 hover:bg-stone-200 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-right shrink-0 w-16">
                <p className="font-semibold text-stone-900 text-sm">{formatCurrency(entry.item.price * entry.quantity)}</p>
              </div>
              <button
                onClick={() => removeFromCart(entry.item.id)}
                className="text-stone-300 hover:text-red-500 transition shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </Card>

      {/* Summary */}
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-stone-700">Subtotal</span>
          <span className="text-lg font-bold text-stone-900">{formatCurrency(subtotal)}</span>
        </div>
        <p className="text-xs text-stone-400 mt-1">Taxes and discounts are calculated at checkout.</p>
        <button
          onClick={() => navigate('/checkout')}
          className="mt-4 w-full rounded-lg bg-amber-500 text-stone-900 font-semibold py-3 text-sm hover:bg-amber-400 transition flex items-center justify-center gap-2"
        >
          Proceed to checkout <ArrowRight className="w-4 h-4" />
        </button>
      </Card>
    </div>
  );
}
