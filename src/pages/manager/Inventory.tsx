import { useState } from 'react';
import { Package, AlertTriangle, Plus, Minus, History, X, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import {
  fetchManagerInventory,
  fetchInventoryTransactions,
  adjustInventory,
} from '@/services/managerService';
import type { InventoryTxType } from '@/types';
import {
  Card,
  CardHeader,
  Badge,
  EmptyState,
  ErrorState,
  SkeletonTable,
  PageTitle,
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ManagerInventory() {
  const { restaurant, branch, user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [adjustItem, setAdjustItem] = useState<{ id: string; name: string; currentQty: number } | null>(null);
  const [historyItem, setHistoryItem] = useState<{ id: string; name: string } | null>(null);
  const [txType, setTxType] = useState<InventoryTxType>('purchase');
  const [txQuantity, setTxQuantity] = useState('');
  const [txReason, setTxReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const inventory = useAsync(
    () => fetchManagerInventory(restaurant!.id, branch!.id),
    [restaurant?.id, branch?.id, refreshKey]
  );

  const transactions = useAsync(
    () => historyItem
      ? fetchInventoryTransactions(restaurant!.id, branch!.id, historyItem.id)
      : Promise.resolve({ data: [], error: null }),
    [historyItem?.id, refreshKey]
  );

  function getStockStatus(quantity: number, minQty: number) {
    if (quantity <= 0) return { label: 'Out of stock', variant: 'danger' as const };
    if (quantity <= minQty) return { label: 'Low stock', variant: 'warning' as const };
    return { label: 'In stock', variant: 'success' as const };
  }

  async function handleAdjust() {
    if (!adjustItem || !restaurant || !branch || !user) return;
    const qty = parseFloat(txQuantity);
    if (isNaN(qty) || qty <= 0) {
      setTxError('Enter a valid quantity greater than 0');
      return;
    }
    setSubmitting(true);
    setTxError(null);
    const { error } = await adjustInventory(
      restaurant.id,
      branch.id,
      adjustItem.id,
      txType,
      qty,
      txReason || undefined,
      user.id
    );
    setSubmitting(false);
    if (error) {
      setTxError(error);
    } else {
      setAdjustItem(null);
      setTxQuantity('');
      setTxReason('');
      setTxError(null);
      setRefreshKey((k) => k + 1);
    }
  }

  const lowStockCount = inventory.data?.filter(
    (item) => Number(item.quantity) <= Number(item.minimum_quantity)
  ).length ?? 0;

  const txTypeOptions: { value: InventoryTxType; label: string; sign: string }[] = [
    { value: 'purchase', label: 'Add Stock (Purchase)', sign: '+' },
    { value: 'adjustment', label: 'Adjustment', sign: '±' },
    { value: 'consumption', label: 'Consumption', sign: '-' },
    { value: 'waste', label: 'Waste', sign: '-' },
    { value: 'transfer_in', label: 'Transfer In', sign: '+' },
    { value: 'transfer_out', label: 'Transfer Out', sign: '-' },
  ];

  return (
    <div className="space-y-5">
      <PageTitle title="Inventory" subtitle={`Stock management for ${branch?.name ?? 'your branch'}`} />

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
            description="Inventory items for your branch will appear here."
            icon={<Package className="w-6 h-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-3">Item</th>
                  <th className="text-right font-medium px-5 py-3">Quantity</th>
                  <th className="text-right font-medium px-5 py-3">Min. Qty</th>
                  <th className="text-left font-medium px-5 py-3">Unit</th>
                  <th className="text-right font-medium px-5 py-3">Cost/Unit</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                  <th className="text-center font-medium px-5 py-3">Actions</th>
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
                      <td className="px-5 py-3 text-right text-stone-900 font-medium">{qty}</td>
                      <td className="px-5 py-3 text-right text-stone-500">{minQty}</td>
                      <td className="px-5 py-3 text-stone-600">{item.unit}</td>
                      <td className="px-5 py-3 text-right text-stone-700">
                        {formatCurrency(Number(item.cost_per_unit))}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setAdjustItem({ id: item.id, name: item.name, currentQty: qty })}
                            className="rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50 transition flex items-center gap-1"
                            title="Adjust stock"
                          >
                            <Plus className="w-3 h-3" /> Adjust
                          </button>
                          <button
                            onClick={() => setHistoryItem({ id: item.id, name: item.name })}
                            className="rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50 transition flex items-center gap-1"
                            title="Transaction history"
                          >
                            <History className="w-3 h-3" /> History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Adjust stock modal */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setAdjustItem(null)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-semibold text-stone-900">Adjust Stock — {adjustItem.name}</h3>
              <button onClick={() => setAdjustItem(null)} className="text-stone-400 hover:text-stone-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-sm text-stone-500">Current quantity: <span className="font-medium text-stone-900">{adjustItem.currentQty}</span></p>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Transaction type</label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as InventoryTxType)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                >
                  {txTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Quantity</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={txQuantity}
                  onChange={(e) => setTxQuantity(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">Reason (optional)</label>
                <input
                  type="text"
                  value={txReason}
                  onChange={(e) => setTxReason(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"
                  placeholder="e.g. weekly purchase, damaged goods…"
                />
              </div>
              {txError && (
                <p className="text-sm text-red-600">{txError}</p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setAdjustItem(null)}
                  className="flex-1 rounded-lg border border-stone-200 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjust}
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-60"
                >
                  {submitting ? 'Saving…' : 'Record transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transaction history modal */}
      {historyItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setHistoryItem(null)} />
          <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0">
              <h3 className="font-semibold text-stone-900">History — {historyItem.name}</h3>
              <button onClick={() => setHistoryItem(null)} className="text-stone-400 hover:text-stone-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {transactions.loading ? (
                <div className="p-5 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 bg-stone-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : transactions.error ? (
                <div className="p-5"><ErrorState message={transactions.error} /></div>
              ) : !transactions.data || transactions.data.length === 0 ? (
                <EmptyState title="No transactions yet" description="Stock adjustments will be logged here." icon={<History className="w-6 h-6" />} />
              ) : (
                <div className="divide-y divide-stone-50">
                  {transactions.data.map((tx) => {
                    const isNegative = tx.type === 'consumption' || tx.type === 'waste' || tx.type === 'transfer_out';
                    return (
                      <div key={tx.id} className="px-5 py-3.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                              isNegative ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                            }`}>
                              {isNegative ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                            </div>
                            <div>
                              <p className="font-medium text-stone-900 text-sm capitalize">{tx.type.replace('_', ' ')}</p>
                              <p className="text-xs text-stone-500">{formatDate(tx.created_at)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-medium text-sm ${isNegative ? 'text-red-600' : 'text-emerald-600'}`}>
                              {isNegative ? '-' : '+'}{Math.abs(Number(tx.quantity))}
                            </p>
                            {tx.reason && <p className="text-xs text-stone-400">{tx.reason}</p>}
                          </div>
                        </div>
                        {tx.profiles?.full_name && (
                          <p className="text-xs text-stone-400 mt-1">by {tx.profiles.full_name}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
