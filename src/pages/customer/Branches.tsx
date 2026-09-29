import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, ArrowLeft, ArrowRight, Phone, UtensilsCrossed } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import { fetchRestaurant, fetchBranches } from '@/services/customerService';
import type { Branch, Restaurant } from '@/types';
import { Card, EmptyState, ErrorState, SkeletonCard } from '@/components/ui';

export default function CustomerBranches({ restaurantId }: { restaurantId: string }) {
  const { cartCount, clearCart } = useCart();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const [restRes, branchRes] = await Promise.all([
      fetchRestaurant(restaurantId),
      fetchBranches(restaurantId),
    ]);
    if (restRes.error) { setError(restRes.error); setLoading(false); return; }
    if (branchRes.error) { setError(branchRes.error); setLoading(false); return; }
    setError(null);
    setRestaurant(restRes.data);
    setBranches(branchRes.data ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
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

  return (
    <div className="space-y-6">
      <Link to="/" className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-900 transition">
        <ArrowLeft className="w-4 h-4" /> Back to restaurants
      </Link>

      {/* Restaurant header */}
      <div className="rounded-2xl bg-gradient-to-br from-stone-800 to-stone-900 text-white p-6">
        <div className="flex items-center gap-3">
          {restaurant.logo_url ? (
            <img src={restaurant.logo_url} alt={restaurant.name} className="w-14 h-14 rounded-xl object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-amber-500 flex items-center justify-center">
              <UtensilsCrossed className="w-7 h-7 text-stone-900" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{restaurant.name}</h1>
            {restaurant.phone && <p className="text-stone-400 text-sm mt-0.5">{restaurant.phone}</p>}
            {restaurant.email && <p className="text-stone-400 text-sm">{restaurant.email}</p>}
          </div>
        </div>
      </div>

      {/* Branches */}
      <div>
        <h2 className="font-semibold text-stone-900 mb-3 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-stone-500" /> Choose a branch
        </h2>

        {cartCount > 0 && (
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            You have items in your cart from another branch. Selecting a different branch will require clearing your current cart.
          </div>
        )}

        {branches.length === 0 ? (
          <Card>
            <EmptyState
              title="No branches available"
              description="This restaurant has no active branches yet."
              icon={<MapPin className="w-6 h-6" />}
            />
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((branch) => (
              <Link
                key={branch.id}
                to={`/restaurants/${restaurantId}/branches/${branch.id}`}
                onClick={() => { if (cartCount > 0) clearCart(); }}
                className="group"
              >
                <Card className="p-5 h-full hover:border-amber-300 hover:shadow-md transition">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <p className="font-semibold text-stone-900">{branch.name}</p>
                  {branch.address && <p className="text-sm text-stone-500 mt-1">{branch.address}</p>}
                  {branch.phone && (
                    <p className="text-sm text-stone-500 mt-0.5 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {branch.phone}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-1 text-amber-600 text-sm font-medium group-hover:gap-2 transition-all">
                    View menu <ArrowRight className="w-4 h-4" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
