import { type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Shield, LogOut, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

export function AdminLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar */}
      <aside className="fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-stone-900 text-stone-100 flex flex-col">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-stone-800 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-stone-900" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">ServeFlow Admin</p>
            <p className="text-xs text-stone-400">Platform Control</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium bg-stone-800 text-white">
            <UtensilsCrossed className="w-4.5 h-4.5 shrink-0" />
            Owner Requests
          </div>
        </nav>

        <div className="px-3 py-4 border-t border-stone-800 shrink-0">
          <div className="flex items-center gap-3 px-3">
            <div className="w-9 h-9 rounded-full bg-stone-700 flex items-center justify-center text-stone-200 font-medium text-sm shrink-0">
              {(profile?.full_name ?? 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-100 truncate">
                {profile?.full_name ?? 'Super Admin'}
              </p>
              <p className="text-xs text-stone-400">Super Admin</p>
            </div>
            <button
              onClick={() => signOut()}
              className="text-stone-400 hover:text-white transition shrink-0"
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
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-stone-700" />
            <h1 className="text-lg font-semibold text-stone-900">Admin Dashboard</h1>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
