import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { UtensilsCrossed, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { supabase } from '@/supabase/client';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [verifyingSession, setVerifyingSession] = useState(true);
  const [recoveryValid, setRecoveryValid] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function verifyRecoverySession() {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) return;

      if (error || !data.session) {
        console.error('[ResetPassword] No valid recovery session found:', error);
        setRecoveryValid(false);
        setVerifyingSession(false);
        return;
      }

      setRecoveryValid(true);
      setVerifyingSession(false);
    }

    verifyRecoverySession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session) {
        setRecoveryValid(true);
        setVerifyingSession(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError('Both fields are required.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    const { data, error } = await supabase.auth.updateUser({ password: newPassword });

    setSubmitting(false);

    if (error) {
      console.error('[ResetPassword] updateUser error:', error);
      setError(error.message);
      return;
    }

    console.log('[ResetPassword] Password updated successfully for user:', data.user?.id);
    setUpdated(true);
    setTimeout(() => navigate('/login', { replace: true }), 2000);
  }

  return (
    <AuthLayout>
      <div className="lg:hidden flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
          <UtensilsCrossed className="w-5 h-5 text-stone-900" />
        </div>
        <span className="text-xl font-semibold tracking-tight text-stone-900">ServeFlow</span>
      </div>

      {updated ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-stone-900">Password Updated</h2>
          <p className="text-stone-500 mt-2 text-sm leading-relaxed">
            Your password has been updated successfully.
          </p>
          <p className="text-stone-400 mt-3 text-xs">Redirecting to sign in…</p>
        </div>
      ) : verifyingSession ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
        </div>
      ) : !recoveryValid ? (
        <>
          <h2 className="text-2xl font-semibold text-stone-900">Reset Link Invalid</h2>
          <p className="text-stone-500 mt-2 text-sm leading-relaxed">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <button
            onClick={() => navigate('/forgot-password', { replace: true })}
            className="mt-6 w-full rounded-lg bg-stone-900 text-white font-medium py-2.5 hover:bg-stone-800 transition"
          >
            Request New Reset Link
          </button>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-semibold text-stone-900">Reset Password</h2>
          <p className="text-stone-500 mt-1">Enter your new password below.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-stone-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                required
                minLength={6}
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
                <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
