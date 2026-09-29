import { Package, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import { useAsync } from '@/hooks/useAsync';
import { fetchInventory } from '@/services/dataService';
import { Card, Badge, EmptyState, ErrorState, SkeletonTable, PageTitle } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';

export default function Inventory() {
  const { restaurant } = useAuth();
  const { selectedBranchId } = useBranchFilter();

  const inventory = useAsync(
    () => fetchInventory(restaurant!.id, selectedBranchId),
    [restaurant?.id, selectedBranchId]
  );

  const lowStockCount = inventory.data?.filter(
    (item) => Number(item.quantity) <= Number(item.minimum_quantity)
  ).length ?? 0;

  function getStockStatus(quantity: number, minQty: number) {
    if (quantity <= 0) return { label: 'Out of stock', variant: 'danger' as const };
    if (quantity <= minQty) return { label: 'Low stock', variant: 'warning' as const };
    return { label: 'In stock', variant: 'success' as const };
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Inventory" subtitle="Monitor stock levels across your branches" />

      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            {lowStockCount} item{lowStockCount !== 1 ? 's' : ''} below minimum stock level
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-stone-500 ml-auto">
          {inventory.data?.length ?? 0} item{(inventory.data?.length ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>

      <Card>
        {inventory.loading ? (
          <SkeletonTable rows={6} columns={6} />
        ) : inventory.error ? (
          <ErrorState message={inventory.error} onRetry={inventory.refetch} />
        ) : !inventory.data || inventory.data.length === 0 ? (
          <EmptyState
            title="No inventory items"
            description="Inventory items will appear here once your branch staff adds them."
            icon={<Package className="w-6 h-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-3">Item</th>
                  <th className="text-left font-medium px-5 py-3">Branch</th>
                  <th className="text-right font-medium px-5 py-3">Quantity</th>
                  <th className="text-right font-medium px-5 py-3">Min. Qty</th>
                  <th className="text-left font-medium px-5 py-3">Unit</th>
                  <th className="text-right font-medium px-5 py-3">Cost/Unit</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {inventory.data.map((item) => {
                  const qty = Number(item.quantity);
                  const minQty = Number(item.minimum_quantity);
                  const status = getStockStatus(qty, minQty);
                  return (
                    <tr key={item.id} className="hover:bg-stone-50/50">
                      <td className="px-5 py-3 font-medium text-stone-900">{item.name}</td>
                      <td className="px-5 py-3 text-stone-600">
                        {(item as any).branches?.name ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-right text-stone-900 font-medium">{qty}</td>
                      <td className="px-5 py-3 text-right text-stone-500">{minQty}</td>
                      <td className="px-5 py-3 text-stone-600">{item.unit}</td>
                      <td className="px-5 py-3 text-right text-stone-700">
                        {formatCurrency(Number(item.cost_per_unit))}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
