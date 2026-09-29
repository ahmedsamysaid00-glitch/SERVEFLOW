import { useState, useEffect, useRef } from 'react';
import { Users, Search, UserPlus, X, Phone } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { searchCustomers, createCustomer } from '@/services/cashierService';
import type { Customer } from '@/types';
import { Card, Badge, EmptyState, ErrorState, SkeletonCard, PageTitle } from '@/components/ui';
import { formatDate } from '@/lib/utils';

export default function CashierCustomers() {
  const { restaurant } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!restaurant || !query.trim()) { setResults([]); return; }
    setLoading(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const res = await searchCustomers(restaurant.id, query);
      if (res.error) { setError(res.error); }
      else { setError(null); setResults(res.data ?? []); }
      setLoading(false);
    }, 300);
  }, [query, restaurant?.id, refreshKey]);

  async function handleCreate() {
    if (!restaurant || !newName.trim()) return;
    setSaving(true);
    setFormError(null);
    const res = await createCustomer(restaurant.id, newName.trim(), newPhone.trim() || null, newEmail.trim() || null);
    setSaving(false);
    if (res.error) { setFormError(res.error); return; }
    setShowForm(false);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setQuery(newName.trim());
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Customers"
        subtitle="Search and create customers for your restaurant"
        action={
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-teal-600 text-white px-3 py-2 text-sm font-medium hover:bg-teal-700 transition"
          >
            <UserPlus className="w-4 h-4" /> New customer
          </button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full sm:w-80 rounded-lg border border-stone-300 bg-white pl-9 pr-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message={error} />
      ) : query.trim() === '' ? (
        <Card>
          <EmptyState
            title="Search for customers"
            description="Type a name or phone number to find customers in your restaurant."
            icon={<Users className="w-6 h-6" />}
          />
        </Card>
      ) : results.length === 0 ? (
        <Card>
          <EmptyState
            title="No customers found"
            description={`No customers match "${query}". Try a different search or create a new customer.`}
            icon={<Users className="w-6 h-6" />}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((customer) => (
            <Card key={customer.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-medium shrink-0">
                  {(customer.full_name ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-stone-900 text-sm truncate">{customer.full_name ?? 'Unknown'}</p>
                  {customer.phone && (
                    <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" /> {customer.phone}
                    </p>
                  )}
                  {customer.email && (
                    <p className="text-xs text-stone-500 truncate">{customer.email}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={customer.status === 'active' ? 'success' : 'danger'}>
                      {customer.status}
                    </Badge>
                    <span className="text-xs text-stone-400">Since {formatDate(customer.created_at).split(',')[0]}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* New customer modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-900/40" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h3 className="font-semibold text-stone-900">New customer</h3>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-900"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
                <input
                  type="text" value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                  placeholder="Customer name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
                <input
                  type="text" value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                  placeholder="Phone number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
                <input
                  type="text" value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                  placeholder="Email (optional)"
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-stone-200 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition">Cancel</button>
                <button
                  onClick={handleCreate}
                  disabled={saving || !newName.trim()}
                  className="flex-1 rounded-lg bg-teal-600 text-white py-2 text-sm font-medium hover:bg-teal-700 transition disabled:opacity-60"
                >
                  {saving ? 'Creating…' : 'Create customer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
