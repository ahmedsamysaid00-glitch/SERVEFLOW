import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Search, UtensilsCrossed, Plus, Minus, MapPin, ArrowLeft, AlertCircle,
} from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import {
  fetchRestaurant, fetchBranch, fetchBranchMenu, fetchCustomerCategories,
  type CustomerMenuItem,
} from '@/services/customerService';
import type { MenuCategory, Branch, Restaurant } from '@/types';
import { Card, EmptyState, ErrorState, SkeletonCard } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

export default function CustomerMenu() {
  const { restaurantId, branchId } = useParams<{ restaurantId: string; branchId: string }>();
  const { cart, addToCart, increment, decrement, cartBranch, branchMismatch, clearCart } = useCart();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [menuItems, setMenuItems] = useState<CustomerMenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [showBranchSwitch, setShowBranchSwitch] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId || !branchId) return;
    setLoading(true);

    const [restRes, branchRes, menuRes, catRes] = await Promise.all([
      fetchRestaurant(restaurantId),
      fetchBranch(branchId, restaurantId),
      fetchBranchMenu(restaurantId, branchId),
      fetchCustomerCategories(restaurantId),
    ]);

    if (restRes.error) { setError(restRes.error); setLoading(false); return; }
    if (branchRes.error) { setError(branchRes.error); setLoading(false); return; }
    if (menuRes.error) { setError(menuRes.error); setLoading(false); return; }

    setError(null);
    setRestaurant(restRes.data);
    setBranch(branchRes.data);
    setMenuItems(menuRes.data ?? []);
    setCategories(catRes.data ?? []);
    setLoading(false);
  }, [restaurantId, branchId]);

  useEffect(() => { load(); }, [load]);

  const filteredItems = menuItems.filter((item) => {
    if (!item.available) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeCategory && item.category_id !== activeCategory) return false;
    return true;
  });

  const handleAddToCart = (item: CustomerMenuItem) => {
    if (!branch) return;
    if (branchMismatch(branch)) {
      setShowBranchSwitch(true);
      return;
    }
    addToCart(item, branch);
  };

  const confirmBranchSwitch = () => {
    clearCart();
    setShowBranchSwitch(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  if (!restaurant) {
    return (
      <Card>
        <EmptyState
          title="Restaurant not found"
          description="This restaurant may be inactive or no longer available."
          icon={<UtensilsCrossed className="w-6 h-6" />}
        />
      </Card>
    );
  }

  if (!branch) {
    return (
      <Card>
        <EmptyState
          title="Branch not found"
          description="This branch may be inactive or does not belong to this restaurant."
          icon={<MapPin className="w-6 h-6" />}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Link to={`/restaurants/${restaurantId}`} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 transition">
        <ArrowLeft className="w-4 h-4" /> Back to {restaurant.name}
      </Link>

      {/* Branch header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <MapPin className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">{restaurant.name} — {branch.name}</span>
        </div>
        {cartBranch && cartBranch.id !== branch.id && (
          <span className="text-xs text-stone-500">
            Cart is from: {cartBranch.name}
          </span>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu…"
          className="w-full rounded-lg border border-stone-300 bg-white pl-9 pr-3 py-2.5 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
        />
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveCategory('')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition whitespace-nowrap ${
              !activeCategory ? 'bg-amber-500 text-stone-900' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition whitespace-nowrap ${
                activeCategory === cat.id ? 'bg-amber-500 text-stone-900' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Menu grid */}
      {filteredItems.length === 0 ? (
        <Card>
          <EmptyState
            title="No items available"
            description="No menu items are currently available at this branch."
            icon={<UtensilsCrossed className="w-6 h-6" />}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredItems.map((item) => {
            const cartEntry = cart[item.id];
            return (
              <Card key={item.id} className="overflow-hidden flex flex-col">
                <div className="relative h-28 bg-stone-100">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-300">
                      <UtensilsCrossed className="w-7 h-7" />
                    </div>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <p className="font-medium text-stone-900 text-sm">{item.name}</p>
                  <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{item.description ?? item.category_name}</p>
                  <p className="font-semibold text-amber-700 text-sm mt-1">{formatCurrency(item.price)}</p>

                  {cartEntry ? (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-stone-50 p-1">
                      <button
                        onClick={() => decrement(item.id)}
                        className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-100 transition"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm font-semibold text-stone-900">{cartEntry.quantity}</span>
                      <button
                        onClick={() => handleAddToCart(item)}
                        className="w-7 h-7 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-600 hover:bg-stone-100 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAddToCart(item)}
                      className="mt-2 w-full rounded-lg bg-amber-500 text-stone-900 text-sm font-medium py-1.5 hover:bg-amber-400 transition flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Branch switch confirmation modal */}
      {showBranchSwitch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setShowBranchSwitch(false)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white shadow-xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-stone-900">Switch branch?</h3>
                <p className="text-sm text-stone-500 mt-1">
                  Your cart contains items from {cartBranch?.name}. Switching to {branch?.name} will clear your cart.
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowBranchSwitch(false)}
                className="flex-1 rounded-lg border border-stone-200 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmBranchSwitch}
                className="flex-1 rounded-lg bg-amber-500 text-stone-900 py-2 text-sm font-medium hover:bg-amber-400 transition"
              >
                Clear & switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
