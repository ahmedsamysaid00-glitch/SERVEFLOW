import { type ReactNode } from 'react';
import { UtensilsCrossed } from 'lucide-react';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-stone-50">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-stone-900 text-stone-100">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6 text-stone-900" />
          </div>
          <span className="text-2xl font-semibold tracking-tight">ServeFlow</span>
        </div>
        <div className="space-y-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            The operating system for modern restaurants.
          </h1>
          <p className="text-stone-400 text-lg leading-relaxed max-w-md">
            Multi-branch menus, branch-level pricing, orders, inventory, and
            teams — all isolated per restaurant, enforced at the database level.
          </p>
        </div>
        <p className="text-stone-500 text-sm">Secure multi-tenant SaaS infrastructure</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
