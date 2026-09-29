import { Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { fetchManagerCustomers } from '@/services/managerService';
import { Card, Badge, EmptyState, ErrorState, SkeletonTable, PageTitle } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function ManagerCustomers() {
  const { restaurant, branch } = useAuth();
  const customers = useAsync(
    () => fetchManagerCustomers(restaurant!.id, branch!.id),
    [restaurant?.id, branch?.id]
  );

  return (
    <div className="space-y-5">
      <PageTitle title="Customers" subtitle={`Customers who ordered at ${branch?.name ?? 'your branch'}`} />

      <div className="flex items-center gap-3">
        <span className="text-sm text-stone-500 ml-auto">
          {customers.data?.length ?? 0} customer{(customers.data?.length ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>

      <Card>
        {customers.loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : customers.error ? (
          <ErrorState message={customers.error} onRetry={customers.refetch} />
        ) : !customers.data || customers.data.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Customers who place orders at your branch will appear here."
            icon={<Users className="w-6 h-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-3">Name</th>
                  <th className="text-left font-medium px-5 py-3">Phone</th>
                  <th className="text-left font-medium px-5 py-3">Email</th>
                  <th className="text-right font-medium px-5 py-3">Orders at branch</th>
                  <th className="text-right font-medium px-5 py-3">Total Spent</th>
                  <th className="text-left font-medium px-5 py-3">Last Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {customers.data.map((customer) => (
                  <tr key={customer.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-medium text-xs">
                          {(customer.full_name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-stone-900">
                          {customer.full_name ?? 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-stone-600">{customer.phone ?? '—'}</td>
                    <td className="px-5 py-3 text-stone-600">{customer.email ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-stone-700">{customer.order_count}</td>
                    <td className="px-5 py-3 text-right font-medium text-stone-900">
                      {formatCurrency(customer.total_spent)}
                    </td>
                    <td className="px-5 py-3 text-stone-500 text-xs whitespace-nowrap">
                      {customer.last_order_date ? formatDate(customer.last_order_date) : '—'}
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
