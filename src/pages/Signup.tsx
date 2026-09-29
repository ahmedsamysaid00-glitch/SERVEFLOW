import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  UtensilsCrossed, AlertCircle, Store, ShoppingBag, Loader2, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AuthLayout } from '@/layouts/AuthLayout';
import { createCustomerAccount } from '@/services/customerService';
import { submitOwnerSignupRequest } from '@/services/adminService';
import { supabase } from '@/supabase/client';

type AccountType = 'owner' | 'customer';
type OwnerStep = 'form' | 'request' | 'request_submitted';

export default function Signup() {
  const { signUp, refresh } = useAuth();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType>('owner');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ownerStep, setOwnerStep] = useState<OwnerStep>('form');

  async function checkOwnerApproval(email: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_owner_email_approved', {
      p_email: email,
    });
    if (error) return false;
    return data === true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (accountType === 'owner') {
      const approved = await checkOwnerApproval(email);
      if (!approved) {
        setOwnerStep('request');
        setSubmitting(false);
        return;
      }
    }

    const { error: signUpError } = await signUp(email, password, fullName);
    if (signUpError) {
      setError(signUpError);
      setSubmitting(false);
      return;
    }

    if (accountType === 'customer') {
      let retries = 0;
      let customerCreated = false;
      while (retries < 5 && !customerCreated) {
        await new Promise((r) => setTimeout(r, 300));
        const res = await createCustomerAccount();
        if (res.data) {
          customerCreated = true;
        } else if (res.error && res.error.includes('Authentication required')) {
          retries++;
        } else {
          setError(res.error ?? 'Could not create your customer account.');
          setSubmitting(false);
          return;
        }
      }
      if (!customerCreated) {
        setError('Could not create your customer account. Please try again.');
        setSubmitting(false);
        return;
      }
      await refresh();
    }

    setSubmitting(false);
    navigate('/');
  }

  async function handleRequestSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await submitOwnerSignupRequest(email);
    setSubmitting(false);

    if (res.error) {
      setError(res.error);
      return;
    }

    setOwnerStep('request_submitted');
  }

  // ─── Owner: request submitted confirmation ────────────────────────────────────
  if (accountType === 'owner' && ownerStep === 'request_submitted') {
    return (
      <AuthLayout>
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5 text-stone-900" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-stone-900">ServeFlow</span>
        </div>
        <div className="text-center py-8">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-semibold text-stone-900">تم إرسال طلب الاشتراك</h2>
          <p className="text-stone-500 mt-2 text-sm leading-relaxed">
            سيتم مراجعة طلبك من الإدارة. سيتم التواصل معك عند الموافقة على طلبك.
          </p>
          <button
            onClick={() => {
              setOwnerStep('form');
              setEmail('');
              setFullName('');
              setPassword('');
            }}
            className="mt-6 text-sm text-amber-600 font-medium hover:underline"
          >
            Back to signup
          </button>
        </div>
      </AuthLayout>
    );
  }

  // ─── Owner: approval required — request form ─────────────────────────────────
  if (accountType === 'owner' && ownerStep === 'request') {
    return (
      <AuthLayout>
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5 text-stone-900" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-stone-900">ServeFlow</span>
        </div>
        <h2 className="text-2xl font-semibold text-stone-900">Owner access required</h2>
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 leading-relaxed" dir="rtl">
          عذرًا، هذا البريد الإلكتروني غير مشترك. يرجى التواصل مع الإدارة للاشتراك في الخدمة.
        </div>
        <p className="text-stone-500 mt-4 text-sm">
          Submit a request below. The platform administrator will review your application.
        </p>

        <form onSubmit={handleRequestSubmit} className="mt-5 space-y-5">
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
              <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
            ) : (
              'Submit request'
            )}
          </button>
        </form>

        <button
          onClick={() => setOwnerStep('form')}
          className="mt-4 text-sm text-stone-500 hover:text-stone-700 transition"
        >
          ← Back
        </button>
      </AuthLayout>
    );
  }

  // ─── Default signup form ──────────────────────────────────────────────────────
  return (
    <AuthLayout>
      <div className="lg:hidden flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center">
          <UtensilsCrossed className="w-5 h-5 text-stone-900" />
        </div>
        <span className="text-xl font-semibold tracking-tight text-stone-900">ServeFlow</span>
      </div>
      <h2 className="text-2xl font-semibold text-stone-900">Create your account</h2>
      <p className="text-stone-500 mt-1">Choose how you want to use ServeFlow</p>

      {/* Account type selector */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => { setAccountType('owner'); setOwnerStep('form'); }}
          className={`rounded-xl border p-4 text-left transition ${
            accountType === 'owner'
              ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/20'
              : 'border-stone-200 bg-white hover:border-stone-300'
          }`}
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${
            accountType === 'owner' ? 'bg-amber-500 text-stone-900' : 'bg-stone-100 text-stone-600'
          }`}>
            <Store className="w-5 h-5" />
          </div>
          <p className="font-semibold text-stone-900 text-sm">Restaurant Owner</p>
          <p className="text-xs text-stone-500 mt-0.5">Create and manage your restaurant</p>
        </button>

        <button
          type="button"
          onClick={() => setAccountType('customer')}
          className={`rounded-xl border p-4 text-left transition ${
            accountType === 'customer'
              ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/20'
              : 'border-stone-200 bg-white hover:border-stone-300'
          }`}
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${
            accountType === 'customer' ? 'bg-amber-500 text-stone-900' : 'bg-stone-100 text-stone-600'
          }`}>
            <ShoppingBag className="w-5 h-5" />
          </div>
          <p className="font-semibold text-stone-900 text-sm">Customer</p>
          <p className="text-xs text-stone-500 mt-0.5">Order from any restaurant</p>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Full name</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-stone-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
            placeholder="Jane Doe"
          />
        </div>
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
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-stone-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition"
            placeholder="At least 6 characters"
          />
        </div>

        {accountType === 'customer' && (
          <p className="text-sm text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-4 py-3">
            After signup, you'll be able to browse all available restaurants and order from any of them.
          </p>
        )}

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
            <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      <p className="text-sm text-stone-500 mt-6 text-center">
        Already have an account?{' '}
        <Link to="/login" className="text-amber-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
