import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Users,
  Package,
  UserCog,
  BarChart3,
  LogOut,
  ChevronDown,
  Building2,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranchFilter } from '@/hooks/useBranchFilter';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/employees', label: 'Employees', icon: UserCog },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
];

export function OwnerLayout() {
  const { profile, membership, restaurant, signOut } = useAuth();
  const { branches, selectedBranchId, setBranchId, selectedBranch } = useBranchFilter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  const roleLabel = membership
    ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1)
    : 'Member';

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-stone-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-stone-200 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 flex items-center gap-3 px-5 border-b border-stone-100 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <UtensilsCrossed className="w-5 h-5 text-stone-900" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-stone-900 text-sm truncate">{restaurant?.name ?? 'ServeFlow'}</p>
            <p className="text-xs text-stone-500">Owner Dashboard</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden ml-auto text-stone-500 hover:text-stone-900"
          >
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
                  isActive
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
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
              <p className="text-sm font-medium text-stone-900 truncate">
                {profile?.full_name ?? 'User'}
              </p>
              <p className="text-xs text-stone-500">{roleLabel}</p>
            </div>
            <button
              onClick={() => signOut()}
              className="text-stone-500 hover:text-stone-900 transition shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-stone-200 sticky top-0 z-20 h-16 flex items-center px-4 sm:px-6 gap-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-stone-600 hover:text-stone-900"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          {/* Branch selector */}
          <div className="relative">
            <button
              onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
              className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
            >
              <Building2 className="w-4 h-4 text-stone-400" />
              <span className="hidden sm:inline">
                {selectedBranch ? selectedBranch.name : 'All Branches'}
              </span>
              <ChevronDown className="w-4 h-4 text-stone-400" />
            </button>
            {branchDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setBranchDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 mt-1 z-20 w-56 rounded-lg border border-stone-200 bg-white shadow-lg py-1 max-h-72 overflow-y-auto">
                  <button
                    onClick={() => {
                      setBranchId(null);
                      setBranchDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-50 transition ${
                      !selectedBranchId ? 'text-amber-600 font-medium' : 'text-stone-700'
                    }`}
                  >
                    All Branches
                  </button>
                  <div className="my-1 border-t border-stone-100" />
                  {branches.map((branch) => (
                    <button
                      key={branch.id}
                      onClick={() => {
                        setBranchId(branch.id);
                        setBranchDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-50 transition ${
                        selectedBranchId === branch.id ? 'text-amber-600 font-medium' : 'text-stone-700'
                      }`}
                    >
                      {branch.name}
                    </button>
                  ))}
                  {branches.length === 0 && (
                    <p className="px-3 py-2 text-sm text-stone-400">No branches found</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-stone-500 hidden sm:block">
              {restaurant?.name}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function RequireOwner({ children }: { children: ReactNode }) {
  const { membership, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!membership) return <>{children}</>;
  if (membership.role !== 'owner') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <UserCog className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-stone-900">Owner access only</h1>
          <p className="text-stone-500 mt-2">
            This dashboard is for restaurant owners. Your role is {membership.role}.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
