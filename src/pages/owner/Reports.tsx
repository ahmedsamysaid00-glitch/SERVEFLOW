import { useState } from 'react';
import { BarChart3, TrendingUp, ShoppingBag, Crown, Package, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import { fetchSalesByBranch, fetchBestSellers, fetchSalesStats } from '@/services/ownerService';
import { fetchInventory } from '@/services/dataService';
import type { DateRange } from '@/types/derived';
import { Card, CardHeader, Badge, EmptyState, ErrorState, SkeletonCard, SkeletonTable, PageTitle } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

export default function Reports() {
  const { restaurant } = useAuth();
  const { selectedBranchId } = useBranchFilter();
  const [range, setRange] = useState<DateRange>('30d');

  const salesByBranch = useAsync(
    () => fetchSalesByBranch(restaurant!.id, range),
    [restaurant?.id, range]
  );

  const overallSales = useAsync(
    () => fetchSalesStats(restaurant!.id, selectedBranchId, range),
    [restaurant?.id, selectedBranchId, range]
  );

  const bestSellers = useAsync(
    () => fetchBestSellers(restaurant!.id, selectedBranchId, 10),
    [restaurant?.id, selectedBranchId]
  );

  const inventory = useAsync(
    () => fetchInventory(restaurant!.id, selectedBranchId),
    [restaurant?.id, selectedBranchId]
  );

  const lowStockItems = inventory.data?.filter(
    (item) => Number(item.quantity) <= Number(item.minimum_quantity)
  ) ?? [];

  const maxRevenue = Math.max(...(salesByBranch.data?.map((b) => b.revenue) ?? [0]), 1);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Reports"
        subtitle="Analytics based on real order data"
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

      {/* Overall sales summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {overallSales.loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : overallSales.error ? (
          <div className="lg:col-span-3">
            <ErrorState message={overallSales.error} onRetry={overallSales.refetch} />
          </div>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Revenue</p>
                  <p className="text-2xl font-semibold text-stone-900 mt-1">
                    {formatCurrency(overallSales.data?.revenue ?? 0)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Orders</p>
                  <p className="text-2xl font-semibold text-stone-900 mt-1">
                    {overallSales.data?.orderCount ?? 0}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Avg. Order Value</p>
                  <p className="text-2xl font-semibold text-stone-900 mt-1">
                    {formatCurrency(overallSales.data?.avgOrderValue ?? 0)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5" />
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Sales by branch */}
      <Card>
        <CardHeader title="Sales by Branch" subtitle={`Revenue comparison across branches (${rangeLabel(range)})`} />
        {salesByBranch.loading ? (
          <div className="p-5 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-stone-100 rounded animate-pulse" />
            ))}
          </div>
        ) : salesByBranch.error ? (
          <ErrorState message={salesByBranch.error} onRetry={salesByBranch.refetch} />
        ) : !salesByBranch.data || salesByBranch.data.length === 0 ? (
          <EmptyState title="No branches found" description="Add branches to see sales comparison." icon={<BarChart3 className="w-6 h-6" />} />
        ) : (
          <div className="p-5 space-y-4">
            {salesByBranch.data.map((entry) => (
              <div key={entry.branch.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-stone-900 text-sm">{entry.branch.name}</span>
                    <span className="text-xs text-stone-400">{entry.orderCount} orders</span>
                  </div>
                  <span className="font-semibold text-stone-900 text-sm">
                    {formatCurrency(entry.revenue)}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${(entry.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Best-selling items */}
      <Card>
        <CardHeader title="Best-Selling Menu Items" subtitle="Top 10 items by quantity sold" />
        {bestSellers.loading ? (
          <SkeletonTable rows={5} columns={4} />
        ) : bestSellers.error ? (
          <ErrorState message={bestSellers.error} onRetry={bestSellers.refetch} />
        ) : !bestSellers.data || bestSellers.data.length === 0 ? (
          <EmptyState
            title="No sales data yet"
            description="Best-selling items will appear here once orders are placed."
            icon={<Crown className="w-6 h-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-3">#</th>
                  <th className="text-left font-medium px-5 py-3">Item</th>
                  <th className="text-right font-medium px-5 py-3">Units Sold</th>
                  <th className="text-right font-medium px-5 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {bestSellers.data.map((item, idx) => (
                  <tr key={item.menu_item_id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3 text-stone-400 font-medium">{idx + 1}</td>
                    <td className="px-5 py-3 font-medium text-stone-900">{item.name}</td>
                    <td className="px-5 py-3 text-right text-stone-700">{item.total_quantity}</td>
                    <td className="px-5 py-3 text-right font-medium text-stone-900">
                      {formatCurrency(item.total_revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Inventory status */}
      <Card>
        <CardHeader title="Inventory Status" subtitle="Items at or below minimum stock level" />
        {inventory.loading ? (
          <SkeletonTable rows={4} columns={3} />
        ) : inventory.error ? (
          <ErrorState message={inventory.error} onRetry={inventory.refetch} />
        ) : lowStockItems.length === 0 ? (
          <EmptyState
            title="All stock levels healthy"
            description="No items are currently below their minimum quantity."
            icon={<Package className="w-6 h-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-3">Item</th>
                  <th className="text-left font-medium px-5 py-3">Branch</th>
                  <th className="text-right font-medium px-5 py-3">Current</th>
                  <th className="text-right font-medium px-5 py-3">Minimum</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {lowStockItems.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3 font-medium text-stone-900">{item.name}</td>
                    <td className="px-5 py-3 text-stone-600">
                      {(item as any).branches?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-stone-900 font-medium">
                      {Number(item.quantity)} {item.unit}
                    </td>
                    <td className="px-5 py-3 text-right text-stone-500">
                      {Number(item.minimum_quantity)} {item.unit}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={Number(item.quantity) <= 0 ? 'danger' : 'warning'}>
                        {Number(item.quantity) <= 0 ? 'Out of stock' : 'Low stock'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
