import { ShoppingBag, TrendingUp, CheckCircle2, Clock, Users, Package, AlertTriangle, Crown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { fetchManagerOverview, fetchManagerBestSellers } from '@/services/managerService';
import { Card, CardHeader, StatCard, Badge, EmptyState, SkeletonCard, ErrorState, PageTitle } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

export default function ManagerOverview() {
  const { restaurant, branch } = useAuth();

  const stats = useAsync(
    () => fetchManagerOverview(restaurant!.id, branch!.id),
    [restaurant?.id, branch?.id]
  );

  const bestSellers = useAsync(
    () => fetchManagerBestSellers(restaurant!.id, branch!.id, 5),
    [restaurant?.id, branch?.id]
  );

  return (
    <div className="space-y-6">
      <PageTitle
        title="Overview"
        subtitle={`Today at ${branch?.name ?? 'your branch'}`}
      />

      {stats.loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Today's Orders"
              value={stats.data?.todayOrders ?? 0}
              icon={<ShoppingBag className="w-5 h-5" />}
              accent="amber"
            />
            <StatCard
              label="Today's Revenue"
              value={formatCurrency(stats.data?.todayRevenue ?? 0)}
              icon={<TrendingUp className="w-5 h-5" />}
              accent="emerald"
            />
            <StatCard
              label="Active Orders"
              value={stats.data?.activeOrders ?? 0}
              icon={<Clock className="w-5 h-5" />}
            />
            <StatCard
              label="Completed Today"
              value={stats.data?.completedOrders ?? 0}
              icon={<CheckCircle2 className="w-5 h-5" />}
              accent="blue"
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              label="Avg. Order Value"
              value={formatCurrency(stats.data?.avgOrderValue ?? 0)}
              icon={<TrendingUp className="w-5 h-5" />}
            />
            <StatCard
              label="Customers"
              value={stats.data?.customerCount ?? 0}
              icon={<Users className="w-5 h-5" />}
            />
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Low Stock</p>
                  <p className="text-2xl font-semibold text-stone-900 mt-1">
                    {stats.data?.lowStockCount ?? 0}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  (stats.data?.lowStockCount ?? 0) > 0
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-stone-100 text-stone-400'
                }`}>
                  {stats.data?.lowStockCount ?? 0 > 0 ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : (
                    <Package className="w-5 h-5" />
                  )}
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader title="Best-Selling Products" subtitle="Top items by quantity sold at this branch" />
        {bestSellers.loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-stone-200" />
                <div className="h-4 bg-stone-200 rounded flex-1" />
              </div>
            ))}
          </div>
        ) : bestSellers.error ? (
          <ErrorState message={bestSellers.error} onRetry={bestSellers.refetch} />
        ) : !bestSellers.data || bestSellers.data.length === 0 ? (
          <EmptyState
            title="No sales data yet"
            description="Best-selling products will appear here once orders start coming in."
            icon={<Crown className="w-6 h-6" />}
          />
        ) : (
          <div className="divide-y divide-stone-50">
            {bestSellers.data.map((item, idx) => (
              <div key={item.menu_item_id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-8 text-center">
                  <span className="text-sm font-semibold text-stone-400">{idx + 1}</span>
                </div>
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover bg-stone-100" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-stone-400">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-900 text-sm truncate">{item.name}</p>
                  <p className="text-xs text-stone-500">{item.total_quantity} units sold</p>
                </div>
                <Badge variant="success">{formatCurrency(item.total_revenue)}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
