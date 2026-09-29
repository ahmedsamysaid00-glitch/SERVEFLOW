import { ShoppingBag, TrendingUp, CheckCircle2, Clock, Users, Building2, Crown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import { useAsync } from '@/hooks/useAsync';
import { fetchOverviewStats, fetchBestSellers, fetchSalesStats } from '@/services/ownerService';
import type { DateRange } from '@/types/derived';
import { Card, CardHeader, CardBody, StatCard, Badge, EmptyState, SkeletonCard, ErrorState, PageTitle } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { useState } from 'react';

export default function Overview() {
  const { restaurant } = useAuth();
  const { selectedBranchId } = useBranchFilter();
  const [range, setRange] = useState<DateRange>('7d');

  const stats = useAsync(
    () => fetchOverviewStats(restaurant!.id, selectedBranchId),
    [restaurant?.id, selectedBranchId]
  );

  const sales = useAsync(
    () => fetchSalesStats(restaurant!.id, selectedBranchId, range),
    [restaurant?.id, selectedBranchId, range]
  );

  const bestSellers = useAsync(
    () => fetchBestSellers(restaurant!.id, selectedBranchId, 5),
    [restaurant?.id, selectedBranchId]
  );

  return (
    <div className="space-y-6">
      <PageTitle
        title="Overview"
        subtitle="Real-time snapshot of your restaurant operations"
        action={
          <div className="flex rounded-lg border border-stone-200 bg-white p-0.5">
            {(['today', '7d', '30d'] as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  range === r ? 'bg-stone-900 text-white' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {r === 'today' ? 'Today' : r === '7d' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>
        }
      />

      {/* Top stats */}
      {stats.loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.refetch} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Orders"
            value={stats.data?.totalOrders ?? 0}
            icon={<ShoppingBag className="w-5 h-5" />}
            accent="amber"
          />
          <StatCard
            label="Total Revenue"
            value={formatCurrency(stats.data?.totalRevenue ?? 0)}
            icon={<TrendingUp className="w-5 h-5" />}
            accent="emerald"
          />
          <StatCard
            label="Completed Orders"
            value={stats.data?.completedOrders ?? 0}
            icon={<CheckCircle2 className="w-5 h-5" />}
            accent="blue"
          />
          <StatCard
            label="Active Orders"
            value={stats.data?.activeOrders ?? 0}
            icon={<Clock className="w-5 h-5" />}
          />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Total Customers"
          value={stats.data?.totalCustomers ?? 0}
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Branches"
          value={stats.data?.branchCount ?? 0}
          icon={<Building2 className="w-5 h-5" />}
        />
        <Card className="p-5">
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Sales ({rangeLabel(range)})</p>
          {sales.loading ? (
            <div className="mt-2 h-7 w-32 bg-stone-200 rounded animate-pulse" />
          ) : sales.error ? (
            <p className="text-sm text-red-500 mt-1">Failed to load</p>
          ) : (
            <>
              <p className="text-2xl font-semibold text-stone-900 mt-1">
                {formatCurrency(sales.data?.revenue ?? 0)}
              </p>
              <p className="text-xs text-stone-500 mt-0.5">
                {sales.data?.orderCount ?? 0} orders · AOV {formatCurrency(sales.data?.avgOrderValue ?? 0)}
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Best sellers */}
      <Card>
        <CardHeader title="Best-Selling Products" subtitle="Top items by quantity sold" />
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
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-10 h-10 rounded-lg object-cover bg-stone-100"
                  />
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

function rangeLabel(range: DateRange): string {
  if (range === 'today') return 'today';
  if (range === '7d') return 'last 7 days';
  return 'last 30 days';
}
