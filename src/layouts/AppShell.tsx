import { type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, Outlet } from 'react-router-dom';
import { UtensilsCrossed, LogOut } from 'lucide-react';

export function AppShell({ children }: { children?: ReactNode }) {
  const { profile, membership, restaurant, branch, signOut } = useAuth();

  const roleLabel = membership
    ? membership.role.charAt(0).toUpperCase() + membership.role.slice(1)
    : 'Member';

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5 text-stone-900" />
            </div>
            <div>
              <p className="font-semibold text-stone-900 leading-tight">
                {restaurant?.name ?? 'ServeFlow'}
              </p>
              {branch && (
                <p className="text-xs text-stone-500 leading-tight">{branch.name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-stone-700">
                {profile?.full_name ?? 'User'}
              </p>
              <p className="text-xs text-stone-500">{roleLabel}</p>
            </div>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900 transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children ?? <Outlet />}</main>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireOnboarding({ children }: { children: ReactNode }) {
  const { membership, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!membership) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
