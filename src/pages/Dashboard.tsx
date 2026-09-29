import { useAuth } from '@/hooks/useAuth';
import { Database, ShieldCheck, GitBranch, Package, ShoppingCart, Users } from 'lucide-react';

export default function Dashboard() {
  const { profile, membership, restaurant, branch } = useAuth();
  const roleLabel = membership
    ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1)
    : '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
          {restaurant?.name ?? 'Your restaurant'}
        </h1>
        <p className="text-stone-500 mt-1">
          {roleLabel} · {branch ? branch.name : 'All branches'}
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-stone-900">Backend foundation ready</h2>
        <p className="text-stone-500 text-sm mt-1 max-w-2xl">
          The Supabase database, Row Level Security policies, and auth foundation
          are live. Dashboards for menu, orders, inventory, and team management
          will be built on top of this foundation.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          <Stat label="Restaurant" value={restaurant?.name ?? '—'} icon={<Database className="w-4 h-4" />} />
          <Stat label="Your role" value={roleLabel} icon={<Users className="w-4 h-4" />} />
          <Stat
            label="Branch"
            value={branch ? branch.name : 'All (owner)'}
            icon={<GitBranch className="w-4 h-4" />}
          />
          <Stat label="Profile" value={profile?.full_name ?? '—'} icon={<Users className="w-4 h-4" />} />
          <Stat label="RLS" value="Active" icon={<ShieldCheck className="w-4 h-4" />} />
          <Stat label="Menu model" value="Branch-scoped" icon={<Package className="w-4 h-4" />} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PlaceholderCard title="Menu" icon={<Package className="w-5 h-5" />} />
        <PlaceholderCard title="Orders" icon={<ShoppingCart className="w-5 h-5" />} />
        <PlaceholderCard title="Inventory" icon={<Database className="w-5 h-5" />} />
        <PlaceholderCard title="Team" icon={<Users className="w-5 h-5" />} />
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 p-3.5">
      <div className="flex items-center gap-2 text-stone-400">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 font-medium text-stone-900 truncate">{value}</p>
    </div>
  );
}

function PlaceholderCard({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 opacity-70">
      <div className="w-10 h-10 rounded-lg bg-stone-100 text-stone-500 flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="font-medium text-stone-700">{title}</p>
      <p className="text-stone-400 text-xs mt-1">Coming next</p>
    </div>
  );
}
