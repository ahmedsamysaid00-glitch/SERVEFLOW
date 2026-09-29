import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed, AlertCircle, Loader2, CheckCircle2, KeyRound } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';

const SUPER_ADMIN_EMAIL = 'ahmedsamysaid00@gmail.com';

export default function SetupAdminPassword() {
  const [email, setEmail] = useState(SUPER_ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('Email is required.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/set-initial-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reset password.');
        setSubmitting(false);
        return;
      }

      setDone(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="lg:hidden flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
          <UtensilsCrossed className="w-5 h-5 text-stone-900" />
        </div>
        <span className="text-xl font-semibold tracking-tight text-stone-900">ServeFlow</span>
      </div>

      {done ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-stone-900">Password Reset</h2>
          <p className="text-stone-500 mt-2 text-sm leading-relaxed">
            Your Super Admin password has been reset successfully. You can now sign in with your new password.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 mt-6 text-sm text-amber-600 font-medium hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="w-5 h-5 text-stone-700" />
            <h2 className="text-2xl font-semibold text-stone-900">Super Admin Password Reset</h2>
          </div>
          <p className="text-stone-500 mt-1 text-sm">
            Reset the password for the Super Admin account. Only the designated Super Admin email can use this flow.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-stone-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-stone-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Confirm Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-stone-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
                placeholder="Re-enter your new password"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-stone-900 text-white font-medium py-2.5 hover:bg-stone-800 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Resetting password…</>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>

          <p className="text-sm text-stone-500 mt-6 text-center">
            Remember your password?{' '}
            <Link to="/login" className="text-amber-600 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}
