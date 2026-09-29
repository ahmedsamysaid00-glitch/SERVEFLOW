import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { UtensilsCrossed, Loader2, Store, GitBranch, ArrowRight } from 'lucide-react';
import { createOwnerWorkspace } from '@/services/onboardingService';

export default function Onboarding() {
  const { profile, refresh } = useAuth();
  const navigate = useNavigate();

  const [restaurantName, setRestaurantName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const trimmedRestaurant = restaurantName.trim();
  const trimmedBranch = branchName.trim();
  const restaurantError = touched && !trimmedRestaurant ? 'Please enter your restaurant name.' : null;
  const branchError = touched && !trimmedBranch ? 'Please enter your first branch name.' : null;
  const canSubmit = trimmedRestaurant.length > 0 && trimmedBranch.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!trimmedRestaurant || !trimmedBranch) return;

    setSubmitting(true);
    setError(null);

    const res = await createOwnerWorkspace(trimmedRestaurant, trimmedBranch);

    if (res.error) {
      setSubmitting(false);
      if (res.error.includes('already belong')) {
        setError('You already belong to a restaurant workspace.');
      } else if (res.error.includes('Customer accounts')) {
        setError('Customer accounts cannot create a restaurant workspace.');
      } else if (res.error.includes('restaurant name')) {
        setError('Please enter your restaurant name.');
      } else if (res.error.includes('branch name')) {
        setError('Please enter your first branch name.');
      } else {
        setError('We couldn\'t create your workspace. Please try again.');
      }
      return;
    }

    await refresh();
    setSubmitting(false);
    navigate('/', { replace: true });
  }

  const greeting = profile?.full_name ? `Welcome, ${profile.full_name}` : 'Welcome to ServeFlow';

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full">
        {/* Branding */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6 text-stone-900" />
          </div>
          <span className="text-2xl font-semibold tracking-tight text-stone-900">ServeFlow</span>
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">{greeting}</h1>
        <p className="text-stone-500 mt-2 text-lg">
          Create your restaurant workspace to get started with ServeFlow.
        </p>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Set up your restaurant</h2>
            <p className="text-sm text-stone-500 mt-1">
              This creates your restaurant and its first branch. You can add more branches later.
            </p>
          </div>

          {/* Restaurant name */}
          <div>
            <label htmlFor="restaurant-name" className="block text-sm font-medium text-stone-700 mb-1.5">
              Restaurant Name
            </label>
            <div className="relative">
              <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                id="restaurant-name"
                type="text"
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Ahmed Restaurant"
                className={`w-full rounded-lg border bg-white pl-9 pr-3 py-2.5 text-sm text-stone-900 outline-none transition ${
                  restaurantError
                    ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-500/20'
                    : 'border-stone-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
                }`}
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            {restaurantError && <p className="mt-1.5 text-sm text-red-600">{restaurantError}</p>}
          </div>

          {/* Branch name */}
          <div>
            <label htmlFor="branch-name" className="block text-sm font-medium text-stone-700 mb-1.5">
              First Branch Name
            </label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                id="branch-name"
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                maxLength={120}
                placeholder="e.g. Main Branch"
                className={`w-full rounded-lg border bg-white pl-9 pr-3 py-2.5 text-sm text-stone-900 outline-none transition ${
                  branchError
                    ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-500/20'
                    : 'border-stone-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
                }`}
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            {branchError && <p className="mt-1.5 text-sm text-red-600">{branchError}</p>}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-lg bg-stone-900 text-white font-semibold py-3 text-sm hover:bg-stone-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating your workspace...</>
            ) : (
              <>Create Restaurant <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-stone-400 mt-6">
          You'll be set up as the restaurant owner with access to all branches.
        </p>
      </div>
    </div>
  );
}
