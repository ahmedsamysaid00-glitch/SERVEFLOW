import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  ShoppingCart,
  ShoppingBag,
  Clock,
  Users,
  LogOut,
  MapPin,
  Menu as MenuIcon,
  X,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { to: '/', label: 'POS', icon: ShoppingCart, end: true },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/shift', label: 'Shift', icon: Clock },
  { to: '/customers', label: 'Customers', icon: Users },
];

export function CashierLayout() {
  const { profile, membership, restaurant, branch, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const roleLabel = membership
    ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1)
    : 'Member';

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-stone-900/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-stone-200 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 flex items-center gap-3 px-5 border-b border-stone-100 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-stone-900 text-sm truncate">{restaurant?.name ?? 'ServeFlow'}</p>
            <p className="text-xs text-stone-500">Cashier Dashboard</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto text-stone-500 hover:text-stone-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-teal-600 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`
              }
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-stone-100 shrink-0">
          <div className="flex items-center gap-3 px-3">
            <div className="w-9 h-9 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-medium text-sm shrink-0">
              {(profile?.full_name ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-900 truncate">{profile?.full_name ?? 'User'}</p>
              <p className="text-xs text-stone-500">{roleLabel}</p>
            </div>
            <button onClick={() => signOut()} className="text-stone-500 hover:text-stone-900 transition shrink-0" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-stone-200 sticky top-0 z-20 h-16 flex items-center px-4 sm:px-6 gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-stone-600 hover:text-stone-900">
            <MenuIcon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 rounded-lg bg-teal-50 border border-teal-200 px-3 py-2">
            <MapPin className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-semibold text-teal-800">{branch?.name ?? 'Unknown Branch'}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-stone-500 hidden sm:block">{restaurant?.name}</span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full mx-auto max-w-[1400px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function RequireCashier({ children }: { children: ReactNode }) {
  const { membership, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-teal-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!membership) return <>{children}</>;
  if (membership.role !== 'cashier') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md text-center">
          <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-stone-900">Cashier access only</h1>
          <p className="text-stone-500 mt-2">This dashboard is for cashier staff. Your role is {membership.role}.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
