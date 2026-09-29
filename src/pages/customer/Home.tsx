import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  UtensilsCrossed, MapPin, ShoppingBag, ArrowRight, Clock, Search,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchMarketplaceRestaurants, fetchLatestCustomerOrder,
  type MarketplaceRestaurant, type CustomerOrderRow,
} from '@/services/customerService';
import { Card, Badge, EmptyState, ErrorState, SkeletonCard } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

const orderStatusVariant: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger'> = {
  pending: 'warning',
  preparing: 'info',
  ready: 'success',
  served: 'neutral',
  completed: 'success',
  cancelled: 'danger',
};

export default function CustomerHome() {
  const { customer } = useAuth();
  const [restaurants, setRestaurants] = useState<MarketplaceRestaurant[]>([]);
  const [latestOrder, setLatestOrder] = useState<CustomerOrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [restRes, orderRes] = await Promise.all([
      fetchMarketplaceRestaurants(),
      fetchLatestCustomerOrder(),
    ]);
    if (restRes.error) { setError(restRes.error); setLoading(false); return; }
    setError(null);
    setRestaurants(restRes.data ?? []);
    setLatestOrder(orderRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = restaurants.filter((r) =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-stone-800 to-stone-900 text-white p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6 text-stone-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ServeFlow Marketplace</h1>
            <p className="text-stone-400 text-sm">Browse all your favorite restaurants</p>
          </div>
        </div>
        {customer?.full_name && (
          <p className="text-stone-400 text-sm">Welcome back, {customer.full_name}</p>
        )}
      </div>

      {/* Latest order */}
      {latestOrder && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-stone-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-stone-500" /> Latest order
            </h2>
            <Link to="/orders" className="text-sm text-amber-600 font-medium hover:underline">View all</Link>
          </div>
          <Link to={`/orders/${latestOrder.id}`} className="block">
            <div className="flex items-center justify-between rounded-lg bg-stone-50 px-4 py-3 hover:bg-stone-100 transition">
              <div className="min-w-0">
                <p className="font-medium text-stone-900 text-sm">Order #{latestOrder.id.slice(0, 8)}</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {latestOrder.restaurants?.name ?? '—'} · {latestOrder.branches?.name ?? '—'} · {formatDate(latestOrder.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant={orderStatusVariant[latestOrder.status] ?? 'neutral'}>{latestOrder.status}</Badge>
                <span className="font-semibold text-stone-900 text-sm">{formatCurrency(latestOrder.total)}</span>
              </div>
            </div>
          </Link>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search restaurants…"
          className="w-full rounded-lg border border-stone-300 bg-white pl-9 pr-3 py-2.5 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
        />
      </div>

      {/* Restaurant grid */}
      <div>
        <h2 className="font-semibold text-stone-900 mb-3 flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-stone-500" /> Restaurants
        </h2>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              title={search ? 'No restaurants found' : 'No restaurants available'}
              description={search ? 'Try a different search term.' : 'There are no active restaurants with branches yet. Please check back later.'}
              icon={<UtensilsCrossed className="w-6 h-6" />}
            />
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((restaurant) => (
              <Link
                key={restaurant.id}
                to={`/restaurants/${restaurant.id}`}
                className="group"
              >
                <Card className="p-5 h-full hover:border-amber-300 hover:shadow-md transition">
                  <div className="flex items-start gap-3">
                    {restaurant.logo_url ? (
                      <img src={restaurant.logo_url} alt={restaurant.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <UtensilsCrossed className="w-6 h-6" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-stone-900 truncate">{restaurant.name}</p>
                      {restaurant.phone && (
                        <p className="text-xs text-stone-500 mt-0.5">{restaurant.phone}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-amber-600 text-sm font-medium group-hover:gap-2 transition-all">
                    View branches <ArrowRight className="w-4 h-4" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        <Link to="/orders">
          <Card className="p-5 hover:border-amber-300 transition">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-stone-900 text-sm">My Orders</p>
                <p className="text-xs text-stone-500">Track your orders</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link to="/profile">
          <Card className="p-5 hover:border-amber-300 transition">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-stone-900 text-sm">Profile</p>
                <p className="text-xs text-stone-500">Manage your info</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
