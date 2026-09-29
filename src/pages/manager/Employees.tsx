import { UserCog } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { fetchBranchEmployees } from '@/services/managerService';
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

export default function ManagerEmployees() {
  const { restaurant, branch } = useAuth();
  const employees = useAsync(
    () => fetchBranchEmployees(restaurant!.id, branch!.id),
    [restaurant?.id, branch?.id]
  );

  return (
    <div className="space-y-5">
      <PageTitle title="Employees" subtitle={`Team members at ${branch?.name ?? 'your branch'}`} />

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
            title="No team members"
            description="Employees assigned to your branch will appear here."
            icon={<UserCog className="w-6 h-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-3">Name</th>
                  <th className="text-left font-medium px-5 py-3">Role</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                  <th className="text-left font-medium px-5 py-3">Phone</th>
                  <th className="text-left font-medium px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {employees.data.map((member) => (
                  <tr key={member.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {member.profiles?.avatar_url ? (
                          <img src={member.profiles.avatar_url} alt={member.profiles.full_name ?? 'Employee'} className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-medium text-xs">
                            {(member.profiles?.full_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-stone-900">
                          {member.profiles?.full_name ?? 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={roleVariant[member.role as MemberRole]}>
                        {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={statusVariant[member.status as MemberStatus]}>
                        {member.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {member.profiles?.phone ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-stone-500 text-xs whitespace-nowrap">
                      {formatDate(member.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
