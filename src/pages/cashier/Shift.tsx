import { useState, useEffect, useCallback } from 'react';
import { Clock, Banknote, CreditCard, ShoppingBag, Play, Square, Loader2, TrendingUp } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchActiveShift, openShift, closeShift, fetchShiftStats,
  type CashierShift, type ShiftStats,
} from '@/services/cashierService';
import { Card, StatCard, EmptyState, ErrorState, SkeletonCard, PageTitle, Badge } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function Shift() {
  const { restaurant, branch, user } = useAuth();
  const [shift, setShift] = useState<CashierShift | null>(null);
  const [stats, setStats] = useState<ShiftStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingCash, setStartingCash] = useState('0');
  const [endingCash, setEndingCash] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const res = await fetchActiveShift(user.id);
    if (res.error) { setError(res.error); }
    else { setError(null); setShift(res.data); }
    setLoading(false);
  }, [user?.id]);

  const loadStats = useCallback(async () => {
    if (!restaurant || !branch || !shift) { setStats(null); return; }
    const res = await fetchShiftStats(restaurant.id, branch.id, shift.cashier_id, shift.opened_at);
    if (!res.error) setStats(res.data);
  }, [restaurant?.id, branch?.id, shift]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Poll stats every 15 seconds while shift is open
  useEffect(() => {
    if (!shift) return;
    const interval = setInterval(loadStats, 15000);
    return () => clearInterval(interval);
  }, [shift, loadStats]);

  async function handleOpenShift() {
    if (!restaurant || !branch || !user) return;
    setActionLoading(true);
    setActionError(null);
    const res = await openShift(restaurant.id, branch.id, user.id, parseFloat(startingCash) || 0);
    setActionLoading(false);
    if (res.error) { setActionError(res.error); return; }
    setShift(res.data);
    setStartingCash('0');
  }

  async function handleCloseShift() {
    if (!shift) return;
    setActionLoading(true);
    setActionError(null);
    const endingNum = parseFloat(endingCash) || 0;
    const res = await closeShift(shift.id, endingNum);
    setActionLoading(false);
    if (res.error) { setActionError(res.error); return; }
    setShowCloseConfirm(false);
    setShift(null);
    setStats(null);
    setEndingCash('');
    await load();
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageTitle title="Shift" subtitle="Manage your cashier shift" />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <PageTitle title="Shift" subtitle="Manage your cashier shift" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Shift" subtitle="Manage your cashier shift" />

      {/* No active shift — open form */}
      {!shift ? (
        <Card className="p-6 max-w-md">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Play className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900">Open a new shift</h3>
              <p className="text-sm text-stone-500">Enter your starting cash to begin</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Starting cash (EGP)</label>
              <input
                type="number" min="0" step="0.01" value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                placeholder="0.00"
              />
            </div>
            {actionError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{actionError}</p>}
            <button
              onClick={handleOpenShift}
              disabled={actionLoading}
              className="w-full rounded-lg bg-teal-600 text-white py-2.5 text-sm font-semibold hover:bg-teal-700 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Open shift
            </button>
          </div>
        </Card>
      ) : (
        <>
          {/* Active shift header */}
          <div className="flex items-center gap-3">
            <Badge variant="success">Shift open</Badge>
            <span className="text-sm text-stone-500">Opened {formatDate(shift.opened_at)}</span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Orders" value={stats?.orderCount ?? 0} icon={<ShoppingBag className="w-5 h-5" />} accent="stone" />
            <StatCard label="Total Sales" value={formatCurrency(stats?.totalSales ?? 0)} icon={<TrendingUp className="w-5 h-5" />} accent="emerald" />
            <StatCard label="Cash Sales" value={formatCurrency(stats?.cashSales ?? 0)} icon={<Banknote className="w-5 h-5" />} accent="amber" />
            <StatCard label="Card Sales" value={formatCurrency(stats?.cardSales ?? 0)} icon={<CreditCard className="w-5 h-5" />} accent="blue" />
          </div>

          {/* Close shift */}
          <Card className="p-5 max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <Square className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-stone-900">Close shift</h3>
                <p className="text-sm text-stone-500">Count your cash and reconcile</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Starting cash</span>
                <span className="font-medium text-stone-900">{formatCurrency(shift.starting_cash)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Cash sales (this shift)</span>
                <span className="font-medium text-stone-900">{formatCurrency(stats?.cashSales ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Card sales (this shift)</span>
                <span className="font-medium text-stone-900">{formatCurrency(stats?.cardSales ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-stone-100 pt-2">
                <span className="font-medium text-stone-700">Expected cash</span>
                <span className="font-semibold text-teal-700">{formatCurrency(shift.starting_cash + (stats?.cashSales ?? 0))}</span>
              </div>
            </div>

            {!showCloseConfirm ? (
              <button
                onClick={() => setShowCloseConfirm(true)}
                className="w-full rounded-lg border border-red-200 text-red-600 py-2.5 text-sm font-semibold hover:bg-red-50 transition flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" /> Close shift
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Actual ending cash (EGP)</label>
                  <input
                    type="number" min="0" step="0.01" value={endingCash}
                    onChange={(e) => setEndingCash(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                {endingCash && (
                  <div className="flex justify-between text-sm rounded-lg bg-stone-50 px-3 py-2">
                    <span className="text-stone-500">Cash difference</span>
                    <span className={`font-semibold ${
                      (parseFloat(endingCash) - (shift.starting_cash + (stats?.cashSales ?? 0))) >= 0
                        ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(parseFloat(endingCash) - (shift.starting_cash + (stats?.cashSales ?? 0)))}
                    </span>
                  </div>
                )}
                {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCloseConfirm(false)}
                    className="flex-1 rounded-lg border border-stone-200 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloseShift}
                    disabled={actionLoading || !endingCash}
                    className="flex-1 rounded-lg bg-red-600 text-white py-2 text-sm font-medium hover:bg-red-700 transition disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm close'}
                  </button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
