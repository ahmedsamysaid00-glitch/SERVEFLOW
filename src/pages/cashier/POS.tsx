import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Plus, Minus, Trash2, X, UserPlus, ShoppingCart, Loader2,
  CheckCircle2, UtensilsCrossed, CreditCard, Banknote,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchPOSMenu, fetchPOSCategories,
  searchCustomers, createCustomer,
  createCashierOrder,
  type POSMenuItem, type CartItem, type CreateOrderResult,
} from '@/services/cashierService';
import type { MenuCategory, Customer, PaymentMethod } from '@/types';
import { Card, Badge, EmptyState, ErrorState, SkeletonCard } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

interface CartEntry {
  item: POSMenuItem;
  quantity: number;
}

export default function POS() {
  const { restaurant, branch, user } = useAuth();
  const [menuItems, setMenuItems] = useState<POSMenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [discount, setDiscount] = useState('0');
  const [taxRate, setTaxRate] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateOrderResult | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idempotencyKeyRef = useRef<string>('');
  const cartSigRef = useRef<string>('');

  const load = useCallback(async () => {
    if (!restaurant || !branch) return;
    setLoading(true);
    const [menuRes, catRes] = await Promise.all([
      fetchPOSMenu(restaurant.id, branch.id),
      fetchPOSCategories(restaurant.id),
    ]);
    if (menuRes.error) { setError(menuRes.error); }
    else { setError(null); setMenuItems(menuRes.data ?? []); }
    if (!catRes.error) setCategories(catRes.data ?? []);
    setLoading(false);
  }, [restaurant?.id, branch?.id]);

  useEffect(() => { load(); }, [load]);

  // Customer search debounce
  useEffect(() => {
    if (!customerSearch.trim() || !restaurant) { setCustomerResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const res = await searchCustomers(restaurant.id, customerSearch);
      if (!res.error) setCustomerResults(res.data ?? []);
    }, 300);
  }, [customerSearch, restaurant?.id]);

  const filteredItems = menuItems.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeCategory && item.category_id !== activeCategory) return false;
    return true;
  });

  const cartList = Object.values(cart);
  const subtotal = cartList.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0);
  const discountNum = Math.min(parseFloat(discount) || 0, subtotal);
  const taxNum = (subtotal - discountNum) * (parseFloat(taxRate) || 0);
  const total = subtotal - discountNum + taxNum;

  function addToCart(item: POSMenuItem) {
    setCart((prev) => {
      const existing = prev[item.id];
      return { ...prev, [item.id]: { item, quantity: (existing?.quantity ?? 0) + 1 } };
    });
  }

  function decrement(itemId: string) {
    setCart((prev) => {
      const existing = prev[itemId];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { ...existing, quantity: existing.quantity - 1 } };
    });
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => {
      const { [itemId]: _, ...rest } = prev;
      return rest;
    });
  }

  function clearCart() {
    setCart({});
    setCustomerId(null);
    setCustomerName('');
    setDiscount('0');
    setTaxRate('0');
    setNotes('');
    setSubmitError(null);
  }

  async function handleCreateCustomer() {
    if (!restaurant || !newCustomerName.trim()) return;
    const res = await createCustomer(restaurant.id, newCustomerName.trim(), newCustomerPhone.trim() || null, null);
    if (res.error) { setSubmitError(res.error); return; }
    if (res.data) {
      setCustomerId(res.data.id);
      setCustomerName(res.data.full_name ?? 'Customer');
      setShowNewCustomer(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
    }
  }

  async function handleSubmit() {
    if (cartList.length === 0) return;

    // Generate a fresh idempotency key for this logical checkout attempt.
    // Reused on retry (network failure, timeout) to prevent duplicate orders.
    // A new key is generated when the cart content changes after a failure.
    const currentSig = cartList.map((e) => `${e.item.id}:${e.quantity}`).join('|')
      + `|${customerId ?? ''}|${discountNum}|${taxNum}|${paymentMethod}|${notes}`;
    if (cartSigRef.current !== currentSig) {
      idempotencyKeyRef.current = crypto.randomUUID();
      cartSigRef.current = currentSig;
    } else if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    setSubmitting(true);
    setSubmitError(null);

    const cartItems: CartItem[] = cartList.map((entry) => ({
      menu_item_id: entry.item.id,
      quantity: entry.quantity,
    }));

    const res = await createCashierOrder({
      cartItems,
      customerId,
      discount: discountNum,
      taxRate: parseFloat(taxRate) || 0,
      paymentMethod,
      notes: notes.trim() || null,
      idempotencyKey: idempotencyKeyRef.current,
    });

    setSubmitting(false);

    if (res.error) { setSubmitError(res.error); return; }
    setSuccess(res.data);
    clearCart();
    idempotencyKeyRef.current = '';
    cartSigRef.current = '';
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="p-8 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold text-stone-900">Order created</h2>
          <p className="text-stone-500 mt-1">Order #{success.order_id.slice(0, 8)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-stone-50 p-3">
              <p className="text-stone-500">Items</p>
              <p className="font-semibold text-stone-900">{success.item_count}</p>
            </div>
            <div className="rounded-lg bg-stone-50 p-3">
              <p className="text-stone-500">Total</p>
              <p className="font-semibold text-stone-900">{formatCurrency(success.total)}</p>
            </div>
          </div>
          <button
            onClick={() => setSuccess(null)}
            className="mt-6 w-full rounded-lg bg-teal-600 text-white py-2.5 text-sm font-medium hover:bg-teal-700 transition"
          >
            New order
          </button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
        <div><SkeletonCard /></div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
      {/* Left: Menu */}
      <div className="space-y-4 min-w-0">
        {/* Search + categories */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              className="w-full rounded-lg border border-stone-300 bg-white pl-9 pr-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              !activeCategory ? 'bg-teal-600 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeCategory === cat.id ? 'bg-teal-600 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 ? (
          <Card>
            <EmptyState
              title="No items available"
              description="No menu items match your search or category filter."
              icon={<UtensilsCrossed className="w-6 h-6" />}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => addToCart(item)}
                className="group rounded-xl border border-stone-200 bg-white overflow-hidden text-left hover:border-teal-400 hover:shadow-md transition"
              >
                <div className="relative h-24 bg-stone-100">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-300">
                      <UtensilsCrossed className="w-7 h-7" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/10 transition flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="font-medium text-stone-900 text-sm truncate">{item.name}</p>
                  <p className="text-xs text-stone-500 truncate">{item.category_name}</p>
                  <p className="font-semibold text-teal-700 text-sm mt-1">{formatCurrency(item.price)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Cart */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card className="flex flex-col max-h-[calc(100vh-6rem)]">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-2 shrink-0">
            <ShoppingCart className="w-4 h-4 text-stone-600" />
            <h3 className="font-semibold text-stone-900 text-sm">Current Order</h3>
            {cartList.length > 0 && (
              <button onClick={clearCart} className="ml-auto text-xs text-stone-400 hover:text-red-600 transition">
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[120px]">
            {cartList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ShoppingCart className="w-8 h-8 text-stone-300 mb-2" />
                <p className="text-sm text-stone-400">Cart is empty</p>
                <p className="text-xs text-stone-400 mt-0.5">Tap items to add them</p>
              </div>
            ) : (
              cartList.map((entry) => (
                <div key={entry.item.id} className="flex items-center gap-2 rounded-lg bg-stone-50 p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{entry.item.name}</p>
                    <p className="text-xs text-stone-500">{formatCurrency(entry.item.price)} each</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => decrement(entry.item.id)}
                      className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-100 transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold text-stone-900">{entry.quantity}</span>
                    <button
                      onClick={() => addToCart(entry.item)}
                      className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-100 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-right shrink-0 w-16">
                    <p className="text-sm font-semibold text-stone-900">{formatCurrency(entry.item.price * entry.quantity)}</p>
                  </div>
                  <button onClick={() => removeFromCart(entry.item.id)} className="text-stone-300 hover:text-red-500 transition shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Customer section */}
          <div className="px-4 py-3 border-t border-stone-100 shrink-0 space-y-2">
            <div className="flex items-center gap-2">
              {customerId ? (
                <div className="flex items-center gap-2 flex-1 rounded-lg bg-teal-50 border border-teal-200 px-3 py-2">
                  <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-medium">
                    {customerName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-teal-800 truncate flex-1">{customerName}</span>
                  <button onClick={() => { setCustomerId(null); setCustomerName(''); }} className="text-teal-400 hover:text-teal-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => { setShowCustomerSearch(true); }}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 py-2 text-sm text-stone-600 hover:bg-stone-50 transition"
                  >
                    <Search className="w-3.5 h-3.5" /> Select customer
                  </button>
                  <button
                    onClick={() => setShowNewCustomer(true)}
                    className="rounded-lg border border-stone-200 p-2 text-stone-600 hover:bg-stone-50 transition"
                    title="New customer"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
            {!customerId && (
              <p className="text-xs text-stone-400 text-center">Guest order (no customer selected)</p>
            )}
          </div>

          {/* Totals + payment */}
          <div className="px-4 py-3 border-t border-stone-100 shrink-0 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Subtotal</span>
              <span className="font-medium text-stone-900">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Discount</span>
              <div className="flex items-center gap-1">
                <input
                  type="number" min="0" step="0.01" value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-20 rounded border border-stone-200 px-2 py-0.5 text-sm text-right focus:border-teal-500 outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-stone-500">Tax rate (%)</span>
              <input
                type="number" min="0" step="0.01" value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-20 rounded border border-stone-200 px-2 py-0.5 text-sm text-right focus:border-teal-500 outline-none"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-semibold text-stone-900">Total</span>
              <span className="text-lg font-bold text-teal-700">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="px-4 py-3 border-t border-stone-100 shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition ${
                  paymentMethod === 'cash' ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                <Banknote className="w-4 h-4" /> Cash
              </button>
              <button
                onClick={() => setPaymentMethod('card')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition ${
                  paymentMethod === 'card' ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                <CreditCard className="w-4 h-4" /> Card
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="px-4 pb-2 shrink-0">
            <input
              type="text" value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Order notes (optional)…"
              className="w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
            />
          </div>

          {submitError && (
            <div className="px-4 pb-2 shrink-0">
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
            </div>
          )}

          {/* Submit */}
          <div className="px-4 pb-4 shrink-0">
            <button
              onClick={handleSubmit}
              disabled={cartList.length === 0 || submitting}
              className="w-full rounded-lg bg-teal-600 text-white py-3 text-sm font-semibold hover:bg-teal-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating order…</>
              ) : (
                <>Create order — {formatCurrency(total)}</>
              )}
            </button>
          </div>
        </Card>
      </div>

      {/* Customer search modal */}
      {showCustomerSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setShowCustomerSearch(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-semibold text-stone-900">Select customer</h3>
              <button onClick={() => setShowCustomerSearch(false)} className="text-stone-400 hover:text-stone-900"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text" value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search by name or phone…"
                  autoFocus
                  className="w-full rounded-lg border border-stone-300 pl-9 pr-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                />
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {customerResults.length === 0 && customerSearch.trim() ? (
                  <p className="text-sm text-stone-400 text-center py-4">No customers found</p>
                ) : (
                  customerResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCustomerId(c.id);
                        setCustomerName(c.full_name ?? 'Customer');
                        setShowCustomerSearch(false);
                        setCustomerSearch('');
                      }}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-stone-50 transition text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 text-xs font-medium">
                        {(c.full_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{c.full_name ?? 'Unknown'}</p>
                        <p className="text-xs text-stone-500">{c.phone ?? 'No phone'}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => { setShowCustomerSearch(false); setShowNewCustomer(true); }}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-stone-200 py-2 text-sm text-stone-600 hover:bg-stone-50 transition"
              >
                <UserPlus className="w-4 h-4" /> Create new customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New customer modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setShowNewCustomer(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-semibold text-stone-900">New customer</h3>
              <button onClick={() => setShowNewCustomer(false)} className="text-stone-400 hover:text-stone-900"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
                <input
                  type="text" value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                  placeholder="Customer name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
                <input
                  type="text" value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                  placeholder="Phone number"
                />
              </div>
              {submitError && <p className="text-sm text-red-600">{submitError}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowNewCustomer(false)} className="flex-1 rounded-lg border border-stone-200 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition">Cancel</button>
                <button
                  onClick={handleCreateCustomer}
                  disabled={!newCustomerName.trim()}
                  className="flex-1 rounded-lg bg-teal-600 text-white py-2 text-sm font-medium hover:bg-teal-700 transition disabled:opacity-60"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
