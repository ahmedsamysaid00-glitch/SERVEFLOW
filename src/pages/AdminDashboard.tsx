import { useState, useEffect, useCallback } from 'react';
import { Check, X, Clock, CheckCircle2, XCircle, Loader2, Mail, Shield, Trash2, Store } from 'lucide-react';
import {
  fetchOwnerRequests,
  reviewOwnerRequest,
  type OwnerSignupRequest,
  type OwnerRequestStatus,
} from '@/services/adminService';
import { formatDate } from '@/lib/utils';
import ResetTestData from '@/pages/admin/ResetTestData';

type Tab = 'requests' | 'reset';
type Filter = 'pending' | 'approved' | 'rejected' | 'deleted' | 'all';

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('requests');
  const [requests, setRequests] = useState<OwnerSignupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchOwnerRequests();
    if (res.error) {
      setError(res.error);
    } else {
      setError(null);
      setRequests(res.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'requests') load();
  }, [load, tab]);

  async function handleAction(requestId: string, action: 'approve' | 'reject') {
    setActioningId(requestId);
    const res = await reviewOwnerRequest(requestId, action);
    setActioningId(null);
    if (res.error) {
      setError(res.error);
    } else {
      await load();
    }
  }

  const filtered = filter === 'all'
    ? requests
    : requests.filter((r) => r.status === filter);

  const counts = {
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    deleted: requests.filter((r) => r.status === 'deleted').length,
  };

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-stone-200">
        <TabButton active={tab === 'requests'} onClick={() => setTab('requests')} icon={<Mail className="w-4 h-4" />}>
          Owner Requests
        </TabButton>
        <TabButton active={tab === 'reset'} onClick={() => setTab('reset')} icon={<Shield className="w-4 h-4" />}>
          Reset Test Data
        </TabButton>
      </div>

      {tab === 'reset' && <ResetTestData />}

      {tab === 'requests' && (
        <>
          {/* Header */}
          <div>
            <h2 className="text-xl font-semibold text-stone-900">طلبات إنشاء حسابات المطاعم</h2>
            <p className="text-stone-500 text-sm mt-1">Review and approve restaurant owner signup requests</p>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-2 border-b border-stone-200 pb-px">
            {(['pending', 'approved', 'rejected', 'deleted', 'all'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition border-b-2 -mb-px ${
                  filter === f
                    ? 'border-stone-900 text-stone-900'
                    : 'border-transparent text-stone-500 hover:text-stone-700'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== 'all' && counts[f as keyof typeof counts] > 0 && (
                  <span className="ml-1.5 text-xs bg-stone-100 text-stone-600 rounded-full px-1.5 py-0.5">
                    {counts[f as keyof typeof counts]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filtered.length === 0 && (
            <div className="text-center py-12">
              <Mail className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500 text-sm">No {filter !== 'all' ? filter : ''} requests</p>
            {filter === 'deleted' && (
              <p className="text-stone-400 text-xs mt-1">Deleted owner requests will appear here as permanent history.</p>
            )}
            </div>
          )}

          {/* Request list */}
          {!loading && !error && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((req) => (
                <RequestCard
                  key={req.id}
                  request={req}
                  actioningId={actioningId}
                  onAction={handleAction}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabButton({
  active, onClick, icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
        active
          ? 'border-stone-900 text-stone-900'
          : 'border-transparent text-stone-500 hover:text-stone-700'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function RequestCard({
  request,
  actioningId,
  onAction,
}: {
  request: OwnerSignupRequest;
  actioningId: string | null;
  onAction: (id: string, action: 'approve' | 'reject') => void;
}) {
  const statusConfig: Record<OwnerRequestStatus, { icon: typeof Clock; color: string; bg: string; label: string }> = {
    pending: { icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', label: 'Pending' },
    approved: { icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', label: 'Approved' },
    rejected: { icon: XCircle, color: 'text-red-700', bg: 'bg-red-50 border-red-200', label: 'Rejected' },
    deleted: { icon: Trash2, color: 'text-stone-600', bg: 'bg-stone-100 border-stone-200', label: 'Deleted' },
  };

  const cfg = statusConfig[request.status];
  const StatusIcon = cfg.icon;

  return (
    <div className={`rounded-xl border ${cfg.bg} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="w-4 h-4 text-stone-400 shrink-0" />
            <p className="font-semibold text-stone-900 truncate">{request.email}</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-stone-500 mt-2">
            <span className="flex items-center gap-1">
              <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
              {cfg.label}
            </span>
            <span>Requested: {formatDate(request.created_at)}</span>
            {request.approved_at && <span>Approved: {formatDate(request.approved_at)}</span>}
            {request.rejected_at && <span>Rejected: {formatDate(request.rejected_at)}</span>}
            {request.deleted_at && <span>Deleted: {formatDate(request.deleted_at)}</span>}
          </div>
          {request.status === 'deleted' && request.original_restaurant_name && (
            <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-2">
              <Store className="w-3.5 h-3.5" />
              <span>Restaurant: {request.original_restaurant_name}</span>
            </div>
          )}
        </div>

        {request.status === 'pending' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onAction(request.id, 'approve')}
              disabled={actioningId === request.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium px-3 py-2 hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {actioningId === request.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Approve
            </button>
            <button
              onClick={() => onAction(request.id, 'reject')}
              disabled={actioningId === request.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-red-200 text-red-700 text-sm font-medium px-3 py-2 hover:bg-red-50 transition disabled:opacity-50"
            >
              {actioningId === request.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <X className="w-3.5 h-3.5" />
              )}
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
