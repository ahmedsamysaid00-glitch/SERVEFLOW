import { useState, useCallback } from 'react';
import {
  Trash2, AlertTriangle, Loader2, CheckCircle2, Eye, ArrowLeft,
  Store, MapPin, Users, ShoppingBag, Package, ClipboardList, UserCircle, Shield,
} from 'lucide-react';
import {
  resetTestData,
  type ResetTestDataReport,
} from '@/services/adminService';
import { Card, Badge } from '@/components/ui';

type Phase = 'idle' | 'previewing' | 'ready' | 'executing' | 'done' | 'error';

export default function ResetTestData() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [report, setReport] = useState<ResetTestDataReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = useCallback(async () => {
    setPhase('previewing');
    setError(null);
    const res = await resetTestData(true);
    if (res.error) {
      setError(res.error);
      setPhase('error');
      return;
    }
    setReport(res.data);
    setPhase('ready');
  }, []);

  const runExecute = useCallback(async () => {
    setPhase('executing');
    setError(null);
    const res = await resetTestData(false);
    if (res.error) {
      setError(res.error);
      setPhase('error');
      return;
    }
    setReport(res.data);
    setPhase('done');
  }, []);

  const reset = () => {
    setPhase('idle');
    setReport(null);
    setError(null);
  };

  if (phase === 'idle') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-stone-900">Reset Test Data</h2>
          <p className="text-stone-500 text-sm mt-1">
            Scan the database for test data and generate a deletion preview. Nothing is deleted until you confirm.
          </p>
        </div>

        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-stone-900">How it works</h3>
              <ol className="mt-2 space-y-1.5 text-sm text-stone-600">
                <li>1. Click <span className="font-medium text-stone-900">Scan</span> to identify all test data.</li>
                <li>2. Review the full deletion report — every restaurant, branch, user, and record is listed.</li>
                <li>3. Click <span className="font-medium text-stone-900">Confirm &amp; Delete</span> to remove only the listed test data.</li>
              </ol>
              <p className="mt-3 text-xs text-stone-400">
                The Super Admin account and any restaurant the Super Admin belongs to are always preserved.
              </p>
            </div>
          </div>

          <button
            onClick={runPreview}
            disabled={phase !== 'idle'}
            className="mt-5 w-full rounded-lg bg-stone-900 text-white font-medium py-2.5 text-sm hover:bg-stone-800 transition flex items-center justify-center gap-2"
          >
            <Eye className="w-4 h-4" /> Scan for test data
          </button>
        </Card>
      </div>
    );
  }

  if (phase === 'previewing' || phase === 'executing') {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400 mx-auto mb-3" />
          <p className="text-sm text-stone-500">
            {phase === 'previewing' ? 'Scanning database for test data…' : 'Deleting test data…'}
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Operation failed</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
          <button
            onClick={reset}
            className="mt-4 rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
          >
            Back
          </button>
        </Card>
      </div>
    );
  }

  if (phase === 'done' && report) {
    return (
      <div className="space-y-6">
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-semibold text-stone-900">Test data deleted</h2>
          <p className="text-stone-500 text-sm mt-1">All identified test data has been removed.</p>
        </div>

        {report.verification && (
          <Card className="p-5">
            <h3 className="font-semibold text-stone-900 text-sm mb-3">Post-deletion verification</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <VerifyRow label="Restaurants" value={report.verification.restaurants_remaining} />
              <VerifyRow label="Branches" value={report.verification.branches_remaining} />
              <VerifyRow label="Members" value={report.verification.restaurant_members_remaining} />
              <VerifyRow label="Orders" value={report.verification.orders_remaining} />
              <VerifyRow label="Order items" value={report.verification.order_items_remaining} />
              <VerifyRow label="Customers" value={report.verification.customers_remaining} />
              <VerifyRow label="Inventory" value={report.verification.inventory_items_remaining} />
              <VerifyRow label="Menu items" value={report.verification.menu_items_remaining} />
              <VerifyRow label="Categories" value={report.verification.menu_categories_remaining} />
              <VerifyRow label="Cashier shifts" value={report.verification.cashier_shifts_remaining} />
              <VerifyRow label="Super Admin" value={report.verification.super_admin_exists} good={report.verification.super_admin_exists > 0} />
              <VerifyRow label="Test users left" value={report.verification.test_auth_users_remaining} good={report.verification.test_auth_users_remaining === 0} />
            </div>
          </Card>
        )}

        <button
          onClick={reset}
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
        >
          Back to start
        </button>
      </div>
    );
  }

  // phase === 'ready' — show the preview report
  if (report && phase === 'ready') {
    const restaurants = report.restaurants ?? [];
    const branches = report.branches ?? [];
    const restaurant_members = report.restaurant_members ?? [];
    const customers = report.customers ?? [];
    const profiles = report.profiles ?? [];
    const auth_users = report.auth_users ?? [];

    const hasData =
      restaurants.length > 0 ||
      branches.length > 0 ||
      customers.length > 0 ||
      auth_users.length > 0;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={reset} className="text-sm text-stone-500 hover:text-stone-900 transition flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-stone-900">Deletion Preview</h2>
          <p className="text-stone-500 text-sm mt-1">
            Review everything below. Nothing is deleted yet. Click <span className="font-medium text-stone-900">Confirm &amp; Delete</span> to proceed.
          </p>
        </div>

        {/* Super Admin preserved notice */}
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-2 text-sm text-emerald-800">
          <Shield className="w-4 h-4 shrink-0" />
          Super Admin <span className="font-medium">{report.super_admin_email}</span> will be preserved.
        </div>

        {!hasData && (
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-medium text-stone-700">No test data found</p>
            <p className="text-sm text-stone-500 mt-1">The database is already clean.</p>
          </Card>
        )}

        {/* Restaurants */}
        {restaurants.length > 0 && (
          <ReportSection icon={<Store className="w-4 h-4" />} title="Restaurants" count={restaurants.length}>
            {restaurants.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium text-stone-900">{r.name}</span>
                <Badge variant={r.status === 'active' ? 'success' : 'neutral'}>{r.status}</Badge>
              </div>
            ))}
          </ReportSection>
        )}

        {/* Branches */}
        {branches.length > 0 && (
          <ReportSection icon={<MapPin className="w-4 h-4" />} title="Branches" count={branches.length}>
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium text-stone-900">{b.name}</span>
                <span className="text-xs text-stone-400 font-mono">{b.id.slice(0, 8)}</span>
              </div>
            ))}
          </ReportSection>
        )}

        {/* Restaurant members */}
        {restaurant_members.length > 0 && (
          <ReportSection icon={<Users className="w-4 h-4" />} title="Restaurant Members" count={restaurant_members.length}>
            {restaurant_members.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium text-stone-900 capitalize">{m.role}</span>
                <span className="text-xs text-stone-400 font-mono">{m.user_id.slice(0, 8)}</span>
              </div>
            ))}
          </ReportSection>
        )}

        {/* Customers */}
        {customers.length > 0 && (
          <ReportSection icon={<ShoppingBag className="w-4 h-4" />} title="Customers" count={customers.length}>
            {customers.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-stone-900">{c.full_name ?? 'Unknown'}</span>
                  {c.email && <span className="text-xs text-stone-400 ml-2">{c.email}</span>}
                </div>
                <Badge variant={c.restaurant_id ? 'info' : 'neutral'}>
                  {c.restaurant_id ? 'Linked' : 'Marketplace'}
                </Badge>
              </div>
            ))}
          </ReportSection>
        )}

        {/* Counts grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <CountCard icon={<ClipboardList className="w-4 h-4" />} label="Orders" value={report.orders_count ?? 0} />
          <CountCard icon={<ClipboardList className="w-4 h-4" />} label="Order Items" value={report.order_items_count ?? 0} />
          <CountCard icon={<Package className="w-4 h-4" />} label="Inventory Items" value={report.inventory_items_count ?? 0} />
          <CountCard icon={<Package className="w-4 h-4" />} label="Inv. Transactions" value={report.inventory_transactions_count ?? 0} />
          <CountCard icon={<ClipboardList className="w-4 h-4" />} label="Cashier Shifts" value={report.cashier_shifts_count ?? 0} />
          <CountCard icon={<Store className="w-4 h-4" />} label="Menu Categories" value={report.menu_categories_count ?? 0} />
          <CountCard icon={<Store className="w-4 h-4" />} label="Menu Items" value={report.menu_items_count ?? 0} />
          <CountCard icon={<Store className="w-4 h-4" />} label="Branch Menu Items" value={report.branch_menu_items_count ?? 0} />
        </div>

        {/* Profiles */}
        {profiles.length > 0 && (
          <ReportSection icon={<UserCircle className="w-4 h-4" />} title="Profiles" count={profiles.length}>
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium text-stone-900">{p.full_name ?? 'Unknown'}</span>
                <span className="text-xs text-stone-400 font-mono">{p.id.slice(0, 8)}</span>
              </div>
            ))}
          </ReportSection>
        )}

        {/* Auth users */}
        {auth_users.length > 0 && (
          <ReportSection icon={<Users className="w-4 h-4" />} title="Auth Users" count={auth_users.length}>
            {auth_users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium text-stone-900">{u.email}</span>
                <span className="text-xs text-stone-400 font-mono">{u.id.slice(0, 8)}</span>
              </div>
            ))}
          </ReportSection>
        )}

        {/* Confirm button */}
        {hasData && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">Confirm deletion</h3>
                <p className="text-sm text-red-700 mt-1">
                  This will permanently delete all {restaurants.length} test restaurant(s) and every record listed above. This cannot be undone.
                </p>
              </div>
            </div>
            <button
              onClick={runExecute}
              className="mt-4 w-full rounded-lg bg-red-600 text-white font-semibold py-3 text-sm hover:bg-red-700 transition flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Confirm &amp; Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function ReportSection({
  icon, title, count, children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100">
        <span className="text-stone-500">{icon}</span>
        <h3 className="font-semibold text-stone-900 text-sm">{title}</h3>
        <span className="ml-auto text-xs bg-stone-100 text-stone-600 rounded-full px-2 py-0.5 font-medium">{count}</span>
      </div>
      <div className="divide-y divide-stone-50">{children}</div>
    </Card>
  );
}

function CountCard({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-stone-500 mb-1">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-semibold text-stone-900">{value}</p>
    </Card>
  );
}

function VerifyRow({ label, value, good }: { label: string; value: number; good?: boolean }) {
  const isGood = good ?? value === 0;
  return (
    <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2">
      <span className="text-stone-600">{label}</span>
      <span className={`font-semibold ${isGood ? 'text-emerald-600' : 'text-red-600'}`}>{value}</span>
    </div>
  );
}
