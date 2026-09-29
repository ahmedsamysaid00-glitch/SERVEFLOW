import { useState } from 'react';
import { UserCog, UserPlus, X, Loader2, Mail, User, GitBranch, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useAsync } from '@/hooks/useAsync';
import { fetchEmployees } from '@/services/dataService';
import { createEmployeeInvitation, resendInvitation } from '@/services/employeeService';
import type { MemberRole, MemberStatus } from '@/types';
import { Card, Badge, EmptyState, ErrorState, SkeletonTable, PageTitle } from '@/components/ui';
import { formatDate } from '@/lib/utils';

const roleVariant: Record<MemberRole, 'info' | 'success' | 'warning' | 'neutral'> = {
  owner: 'info',
  manager: 'success',
  kitchen: 'warning',
  cashier: 'neutral',
};

const statusVariant: Record<MemberStatus, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  invited: 'warning',
  suspended: 'danger',
};

const INVITABLE_ROLES: { value: MemberRole; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'cashier', label: 'Cashier' },
];

export default function Employees() {
  const { restaurant } = useAuth();
  const { branches } = useBranches();
  const employees = useAsync(
    () => fetchEmployees(restaurant!.id),
    [restaurant?.id]
  );

  const [showModal, setShowModal] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<{ id: string; type: 'success' | 'error'; text: string } | null>(null);

  async function handleResend(memberId: string) {
    setResendingId(memberId);
    setResendMsg(null);
    const res = await resendInvitation(memberId);
    setResendingId(null);
    if (res.error) {
      setResendMsg({ id: memberId, type: 'error', text: res.error });
    } else {
      setResendMsg({ id: memberId, type: 'success', text: 'Invitation email resent successfully.' });
      employees.refetch();
    }
    setTimeout(() => setResendMsg(null), 5000);
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Employees"
        subtitle="Monitor your restaurant team members"
        action={
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-900 text-white text-sm font-medium px-4 py-2.5 hover:bg-stone-800 transition"
          >
            <UserPlus className="w-4 h-4" />
            Add Employee
          </button>
        }
      />

      <div className="flex items-center gap-3">
        <span className="text-sm text-stone-500 ml-auto">
          {employees.data?.length ?? 0} member{(employees.data?.length ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>

      <Card>
        {employees.loading ? (
          <SkeletonTable rows={4} columns={4} />
        ) : employees.error ? (
          <ErrorState message={employees.error} onRetry={employees.refetch} />
        ) : !employees.data || employees.data.length === 0 ? (
          <EmptyState
            title="No team members yet"
            description="Employees will appear here once you add them to your restaurant."
            icon={<UserCog className="w-6 h-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-3">Name</th>
                  <th className="text-left font-medium px-5 py-3">Role</th>
                  <th className="text-left font-medium px-5 py-3">Branch</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                  <th className="text-left font-medium px-5 py-3">Phone</th>
                  <th className="text-left font-medium px-5 py-3">Joined</th>
                  <th className="text-left font-medium px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {employees.data.map((member) => (
                  <tr key={member.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {member.profiles?.avatar_url ? (
                          <img
                            src={member.profiles.avatar_url}
                            alt={member.profiles.full_name ?? 'Employee'}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-medium text-xs">
                            {(member.profiles?.full_name ?? member.invite_email ?? '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-stone-900 block">
                            {member.profiles?.full_name ?? 'Unknown'}
                          </span>
                          {member.status === 'invited' && member.invite_email && (
                            <span className="text-xs text-stone-400">{member.invite_email}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={roleVariant[member.role]}>
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {member.branches?.name ?? 'All branches'}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={statusVariant[member.status]}>
                        {member.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {member.profiles?.phone ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-stone-500 text-xs whitespace-nowrap">
                      {formatDate(member.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      {member.status === 'invited' && !member.user_id && (
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleResend(member.id)}
                            disabled={resendingId === member.id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 text-stone-700 text-xs font-medium px-2.5 py-1.5 hover:bg-stone-50 transition disabled:opacity-50"
                          >
                            {resendingId === member.id ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Sending…</>
                            ) : (
                              <><Mail className="w-3 h-3" /> Resend</>
                            )}
                          </button>
                          {resendMsg?.id === member.id && (
                            <span className={`text-xs ${resendMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {resendMsg.text}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <AddEmployeeModal
          branches={branches}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            employees.refetch();
          }}
        />
      )}
    </div>
  );
}

function AddEmployeeModal({
  branches,
  onClose,
  onSuccess,
}: {
  branches: { id: string; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('manager');
  const [branchId, setBranchId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState(false);

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim();
  const nameError = touched && !trimmedName ? 'Please enter the employee\u2019s full name.' : null;
  const emailError = touched && !trimmedEmail ? 'Please enter an email address.' : null;
  const branchError = touched && !branchId ? 'Please select a branch.' : null;
  const canSubmit = trimmedName.length > 0 && trimmedEmail.length > 0 && branchId.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!trimmedName || !trimmedEmail || !branchId) return;

    setSubmitting(true);
    setError(null);

    const res = await createEmployeeInvitation(trimmedEmail, trimmedName, role, branchId);

    if (res.error) {
      setSubmitting(false);
      const msg = res.error;
      if (msg.includes('already a member')) {
        setError('This person is already a member of your restaurant.');
      } else if (msg.includes('already been sent')) {
        setError('An invitation has already been sent to this email.');
      } else if (msg.includes('Only restaurant owners')) {
        setError('Only restaurant owners can invite employees.');
      } else if (msg.includes('Cannot invite another owner')) {
        setError('You cannot invite another owner.');
      } else if (msg.includes('branch does not belong')) {
        setError('The selected branch does not belong to your restaurant.');
      } else if (msg.includes('Employee created, but invitation email')) {
        setError(msg);
      } else if (msg.includes('email')) {
        setError('Please enter a valid email address.');
      } else if (msg.includes('name')) {
        setError('Please enter the employee\u2019s full name.');
      } else if (msg.includes('Invalid role')) {
        setError('Please select a valid role.');
      } else {
        setError('We couldn\u2019t send the invitation. Please try again.');
      }
      return;
    }

    setSubmitting(false);
    setSuccess(true);
    setTimeout(() => onSuccess(), 1800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-stone-900">Add Employee</h2>
              <p className="text-xs text-stone-500">Invite a team member to your restaurant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition"
            disabled={submitting}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success state */}
        {success && (
          <div className="px-6 py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="font-semibold text-stone-900 text-lg">Invitation sent successfully.</h3>
            <p className="text-sm text-stone-500 mt-1.5">
              An email invitation has been sent to {trimmedEmail}. The employee can set their password and join your team using the link in the email.
            </p>
          </div>
        )}

        {/* Form */}
        {!success && (
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Full name */}
          <div>
            <label htmlFor="emp-name" className="block text-sm font-medium text-stone-700 mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                id="emp-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={120}
                placeholder="e.g. John Smith"
                className={`w-full rounded-lg border bg-white pl-9 pr-3 py-2.5 text-sm text-stone-900 outline-none transition ${
                  nameError
                    ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-500/20'
                    : 'border-stone-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
                }`}
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            {nameError && <p className="mt-1.5 text-sm text-red-600">{nameError}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="emp-email" className="block text-sm font-medium text-stone-700 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                id="emp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
                placeholder="e.g. john@restaurant.com"
                className={`w-full rounded-lg border bg-white pl-9 pr-3 py-2.5 text-sm text-stone-900 outline-none transition ${
                  emailError
                    ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-500/20'
                    : 'border-stone-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
                }`}
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            {emailError && <p className="mt-1.5 text-sm text-red-600">{emailError}</p>}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Role</label>
            <div className="grid grid-cols-3 gap-2">
              {INVITABLE_ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  disabled={submitting}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    role === r.value
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-stone-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Owner role is not available for invitation.
            </p>
          </div>

          {/* Branch */}
          <div>
            <label htmlFor="emp-branch" className="block text-sm font-medium text-stone-700 mb-1.5">
              Branch
            </label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              <select
                id="emp-branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={submitting}
                className={`w-full rounded-lg border bg-white pl-9 pr-3 py-2.5 text-sm text-stone-900 outline-none transition appearance-none ${
                  branchError
                    ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-500/20'
                    : 'border-stone-300 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
                }`}
              >
                <option value="">Select a branch…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            {branchError && <p className="mt-1.5 text-sm text-red-600">{branchError}</p>}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 rounded-lg border border-stone-200 text-stone-700 text-sm font-medium px-4 py-2.5 hover:bg-stone-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-stone-900 text-white text-sm font-semibold px-4 py-2.5 hover:bg-stone-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending invite…</>
              ) : (
                'Send Invitation'
              )}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
