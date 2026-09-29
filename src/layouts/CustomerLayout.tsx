import { type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  UtensilsCrossed, ShoppingBag, User, LogOut, ShoppingCart,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';

const navItems = [
  { to: '/', label: 'Restaurants', icon: UtensilsCrossed, end: true },
  { to: '/orders', label: 'My Orders', icon: ShoppingBag },
  { to: '/profile', label: 'Profile', icon: User },
];

export function CustomerLayout() {
  const { profile, customer, signOut } = useAuth();
  const { cartCount } = useCart();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
              <UtensilsCrossed className="w-5 h-5 text-stone-900" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-stone-900 text-sm truncate leading-tight">
                {customer ? 'ServeFlow' : 'ServeFlow'}
              </p>
              <p className="text-xs text-stone-500 leading-tight">Customer</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate('/cart')}
              className="relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 transition"
            >
              <ShoppingCart className="w-4 h-4" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Desktop sidebar */}
        <aside className="hidden sm:flex flex-col w-56 border-r border-stone-200 bg-white sticky top-16 h-[calc(100vh-4rem)]">
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-amber-50 text-amber-700' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="px-3 py-3 border-t border-stone-100">
            <p className="text-xs text-stone-500 truncate px-3">{profile?.full_name ?? customer?.full_name ?? 'Customer'}</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-30">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1.5 text-xs font-medium transition ${
                  isActive ? 'text-amber-700' : 'text-stone-500'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function RequireCustomer({ children }: { children: ReactNode }) {
  const { membership, customer, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (membership) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-stone-900">Staff account</h1>
          <p className="text-stone-500 mt-2">Your account is a staff account. Please use the staff dashboard.</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-stone-900">No customer profile</h1>
          <p className="text-stone-500 mt-2">Your account is not linked to a restaurant customer profile.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
