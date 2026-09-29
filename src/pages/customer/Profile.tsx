import { useState } from 'react';
import { User, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { updateCustomerProfile } from '@/services/customerService';
import { Card } from '@/components/ui';

export default function CustomerProfile() {
  const { customer, profile } = useAuth();
  const [fullName, setFullName] = useState(customer?.full_name ?? profile?.full_name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!customer) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateCustomerProfile(customer.id, {
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (!customer) {
    return (
      <Card className="p-8 text-center">
        <p className="text-stone-500">No customer profile found.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h1 className="text-xl font-semibold text-stone-900 tracking-tight">My Profile</h1>
        <p className="text-stone-500 text-sm mt-0.5">Update your personal information</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-stone-100">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-semibold">
            {(fullName || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-stone-900">{fullName || 'Customer'}</p>
            <p className="text-xs text-stone-500">Customer account</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Full name</label>
          <input
            type="text" value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
            placeholder="Your name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Phone</label>
          <input
            type="text" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
            placeholder="Phone number"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">Email</label>
          <input
            type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
            placeholder="Email address"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {saved && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-4 h-4" /> Profile updated successfully
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-stone-900 text-white font-medium py-2.5 text-sm hover:bg-stone-800 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          ) : (
            <>Save changes</>
          )}
        </button>
      </Card>

      <p className="text-xs text-stone-400 text-center">
        Your restaurant, account status, and user ID cannot be changed.
      </p>
    </div>
  );
}
