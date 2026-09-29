import { useState } from 'react';
import { TrendingUp, ShoppingBag, BarChart3, Crown, Package, AlertTriangle, CreditCard } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import {
  fetchManagerSalesStats,
  fetchManagerSalesOverTime,
  fetchManagerBestSellers,
  fetchPaymentMethodBreakdown,
} from '@/services/managerService';
import { fetchManagerInventory } from '@/services/managerService';
import type { DateRange } from '@/types/derived';
import {
  Card,
  CardHeader,
  Badge,
  EmptyState,
  ErrorState,
  SkeletonCard,
  SkeletonTable,
  PageTitle,
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ManagerReports() {
  const { restaurant, branch } = useAuth();
  const [range, setRange] = useState<DateRange>('30d');

  const salesStats = useAsync(
    () => fetchManagerSalesStats(restaurant!.id, branch!.id, range),
    [restaurant?.id, branch?.id, range]
  );

  const salesOverTime = useAsync(
    () => fetchManagerSalesOverTime(restaurant!.id, branch!.id, range),
    [restaurant?.id, branch?.id, range]
  );

  const bestSellers = useAsync(
    () => fetchManagerBestSellers(restaurant!.id, branch!.id, 10),
    [restaurant?.id, branch?.id]
  );

  const paymentBreakdown = useAsync(
    () => fetchPaymentMethodBreakdown(restaurant!.id, branch!.id, range),
    [restaurant?.id, branch?.id, range]
  );

  const inventory = useAsync(
    () => fetchManagerInventory(restaurant!.id, branch!.id),
    [restaurant?.id, branch?.id]
  );

  const lowStockItems = inventory.data?.filter(
    (item) => Number(item.quantity) <= Number(item.minimum_quantity)
  ) ?? [];

  const maxRevenue = Math.max(...(salesOverTime.data?.map((d) => d.revenue) ?? [0]), 1);
  const maxPaymentTotal = Math.max(...(paymentBreakdown.data?.map((p) => p.total) ?? [0]), 1);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Reports"
        subtitle={`Analytics for ${branch?.name ?? 'your branch'}`}
        action={
          <div className="flex rounded-lg border border-stone-200 bg-white p-0.5">
            {(['today', '7d', '30d'] as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  range === r ? 'bg-emerald-600 text-white' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {r === 'today' ? 'Today' : r === '7d' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>
        }
      />

      {/* Sales summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {salesStats.loading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : salesStats.error ? (
          <div className="lg:col-span-3"><ErrorState message={salesStats.error} onRetry={salesStats.refetch} /></div>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wide">Revenue</p>
                  <p className="text-2xl font-semibold text-stone-900 mt-1">{formatCurrency(salesStats.data?.revenue ?? 0)}</p>
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
                  <p className="text-2xl font-semibold text-stone-900 mt-1">{salesStats.data?.orderCount ?? 0}</p>
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
                  <p className="text-2xl font-semibold text-stone-900 mt-1">{formatCurrency(salesStats.data?.avgOrderValue ?? 0)}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5" />
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Sales over time */}
      <Card>
        <CardHeader title="Sales Over Time" subtitle={`Daily revenue (${rangeLabel(range)})`} />
        {salesOverTime.loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 bg-stone-100 rounded animate-pulse" />
            ))}
          </div>
        ) : salesOverTime.error ? (
          <ErrorState message={salesOverTime.error} onRetry={salesOverTime.refetch} />
        ) : !salesOverTime.data || salesOverTime.data.length === 0 ? (
          <EmptyState title="No sales data" description="Sales over time will appear here once orders are placed." icon={<BarChart3 className="w-6 h-6" />} />
        ) : (
          <div className="p-5 space-y-2.5">
            {salesOverTime.data.map((entry) => (
              <div key={entry.date}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-stone-500">{formatDate(entry.date).split(',')[0]}</span>
                  <span className="text-xs font-medium text-stone-700">
                    {formatCurrency(entry.revenue)} · {entry.orderCount} orders
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(entry.revenue / maxRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Payment method breakdown */}
      <Card>
        <CardHeader title="Payment Method Breakdown" subtitle={`Orders by payment method (${rangeLabel(range)})`} />
        {paymentBreakdown.loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-6 bg-stone-100 rounded animate-pulse" />
            ))}
          </div>
        ) : paymentBreakdown.error ? (
          <ErrorState message={paymentBreakdown.error} />
        ) : !paymentBreakdown.data || paymentBreakdown.data.length === 0 ? (
          <EmptyState title="No payment data" description="Payment method breakdown will appear here once orders are placed." icon={<CreditCard className="w-6 h-6" />} />
        ) : (
          <div className="p-5 space-y-3">
            {paymentBreakdown.data.map((entry) => (
              <div key={entry.method}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-stone-700 capitalize">{entry.method}</span>
                  <span className="text-xs text-stone-500">
                    {entry.count} orders · {formatCurrency(entry.total)}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${(entry.total / maxPaymentTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Best sellers */}
      <Card>
        <CardHeader title="Best-Selling Items" subtitle="Top 10 items by quantity sold at this branch" />
        {bestSellers.loading ? (
          <SkeletonTable rows={5} columns={4} />
        ) : bestSellers.error ? (
          <ErrorState message={bestSellers.error} onRetry={bestSellers.refetch} />
        ) : !bestSellers.data || bestSellers.data.length === 0 ? (
          <EmptyState title="No sales data" description="Best-selling items will appear here once orders are placed." icon={<Crown className="w-6 h-6" />} />
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
                    <td className="px-5 py-3 text-right font-medium text-stone-900">{formatCurrency(item.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Low stock inventory */}
      <Card>
        <CardHeader title="Low-Stock Inventory" subtitle="Items at or below minimum quantity" />
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
                  <th className="text-right font-medium px-5 py-3">Current</th>
                  <th className="text-right font-medium px-5 py-3">Minimum</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {lowStockItems.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3 font-medium text-stone-900">{item.name}</td>
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
