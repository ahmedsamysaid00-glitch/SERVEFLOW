import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed, AlertCircle, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { supabase } from '@/supabase/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const trimmedEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setSubmitting(false);

    if (error) {
      console.error('[ForgotPassword] resetPasswordForEmail error:', error);
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <AuthLayout>
      <div className="lg:hidden flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
          <UtensilsCrossed className="w-5 h-5 text-stone-900" />
        </div>
        <span className="text-xl font-semibold tracking-tight text-stone-900">ServeFlow</span>
      </div>

      {sent ? (
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-stone-900">Check your email</h2>
          <p className="text-stone-500 mt-2 text-sm leading-relaxed">
            Password reset link has been sent to your email. Please check your inbox.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 mt-6 text-sm text-amber-600 font-medium hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-semibold text-stone-900">Forgot Password</h2>
          <p className="text-stone-500 mt-1">
            Enter your email and we'll send you a reset link.
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
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              ) : (
                'Send Reset Link'
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
