import { useEffect, useState } from 'react';
import { Clock, ChefHat, CheckCircle2, XCircle, EyeOff, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchKitchenOrderStats, fetchUnavailableItemCount, type KitchenOrderStats } from '@/services/kitchenService';
import { Card, StatCard, SkeletonCard, ErrorState, PageTitle } from '@/components/ui';
import { supabase } from '@/supabase/client';

export default function KitchenOverview() {
  const { restaurant, branch } = useAuth();
  const [stats, setStats] = useState<KitchenOrderStats | null>(null);
  const [unavailableCount, setUnavailableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!restaurant || !branch) return;
    setLoading(true);
    const [statsRes, unavailRes] = await Promise.all([
      fetchKitchenOrderStats(restaurant.id, branch.id),
      fetchUnavailableItemCount(restaurant.id, branch.id),
    ]);
    if (statsRes.error) { setError(statsRes.error); setStats(null); }
    else { setError(null); setStats(statsRes.data); }
    if (!unavailRes.error) setUnavailableCount(unavailRes.data ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
    if (!restaurant || !branch) return;

    // Realtime: listen for order changes at this branch
    const channel = supabase
      .channel('kitchen-overview-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branch.id}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branch_menu_items', filter: `branch_id=eq.${branch.id}` },
        () => load()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurant?.id, branch?.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageTitle title="Kitchen Overview" subtitle={branch?.name ?? ''} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageTitle title="Kitchen Overview" subtitle={branch?.name ?? ''} />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Kitchen Overview" subtitle={`Live operations at ${branch?.name ?? 'your branch'}`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Pending" value={stats?.pending ?? 0} icon={<Clock className="w-5 h-5" />} accent="amber" />
        <StatCard label="Preparing" value={stats?.preparing ?? 0} icon={<ChefHat className="w-5 h-5" />} accent="blue" />
        <StatCard label="Ready" value={stats?.ready ?? 0} icon={<CheckCircle2 className="w-5 h-5" />} accent="emerald" />
        <StatCard label="Completed Today" value={stats?.completedToday ?? 0} icon={<ShoppingBag className="w-5 h-5" />} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Cancelled Today" value={stats?.cancelledToday ?? 0} icon={<XCircle className="w-5 h-5" />} />
        <StatCard label="Unavailable Items" value={unavailableCount} icon={<EyeOff className="w-5 h-5" />} />
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Active Tickets</p>
              <p className="text-2xl font-semibold text-stone-900 mt-1">
                {(stats?.pending ?? 0) + (stats?.preparing ?? 0) + (stats?.ready ?? 0)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <ChefHat className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {stats && stats.pending === 0 && stats.preparing === 0 && stats.ready === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center mb-3">
              <ChefHat className="w-6 h-6" />
            </div>
            <p className="font-medium text-stone-700">No active orders</p>
            <p className="text-sm text-stone-500 mt-1 max-w-sm">New orders will appear here automatically when customers place them.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
