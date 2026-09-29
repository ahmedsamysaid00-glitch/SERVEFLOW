import { UtensilsCrossed } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { fetchBranchMenu } from '@/services/managerService';
import { Card, Badge, EmptyState, ErrorState, SkeletonTable, PageTitle, Select } from '@/components/ui';
import { formatCurrency } from '@/lib/utils';
import { useState, useMemo } from 'react';

export default function ManagerMenu() {
  const { restaurant, branch } = useAuth();
  const [categoryFilter, setCategoryFilter] = useState('');

  const menu = useAsync(
    () => fetchBranchMenu(restaurant!.id, branch!.id),
    [restaurant?.id, branch?.id]
  );

  const categories = useMemo(() => {
    if (!menu.data) return [];
    const set = new Set<string>();
    for (const item of menu.data) {
      const cat = item.menu_items?.menu_categories?.name;
      if (cat) set.add(cat);
    }
    return Array.from(set).sort();
  }, [menu.data]);

  const filteredData = useMemo(() => {
    if (!menu.data) return [];
    if (!categoryFilter) return menu.data;
    return menu.data.filter(
      (item) => item.menu_items?.menu_categories?.name === categoryFilter
    );
  }, [menu.data, categoryFilter]);

  return (
    <div className="space-y-5">
      <PageTitle title="Menu" subtitle={`Menu view for ${branch?.name ?? 'your branch'} — read-only`} />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={categoryFilter} onChange={setCategoryFilter}>
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </Select>
        <span className="text-sm text-stone-500 ml-auto">
          {filteredData.length} item{filteredData.length !== 1 ? 's' : ''}
        </span>
      </div>

      <Card>
        {menu.loading ? (
          <SkeletonTable rows={6} columns={5} />
        ) : menu.error ? (
          <ErrorState message={menu.error} onRetry={menu.refetch} />
        ) : filteredData.length === 0 ? (
          <EmptyState
            title="No menu items"
            description="Menu items for your branch will appear here. Contact your kitchen staff to manage menu content."
            icon={<UtensilsCrossed className="w-6 h-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-stone-500 text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-5 py-3">Item</th>
                  <th className="text-left font-medium px-5 py-3">Category</th>
                  <th className="text-right font-medium px-5 py-3">Price</th>
                  <th className="text-left font-medium px-5 py-3">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filteredData.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {item.menu_items?.image_url ? (
                          <img src={item.menu_items.image_url} alt={item.menu_items.name} className="w-9 h-9 rounded-lg object-cover bg-stone-100" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center text-stone-400">
                            <UtensilsCrossed className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-stone-900">{item.menu_items?.name ?? 'Unknown'}</p>
                          {item.menu_items?.description && (
                            <p className="text-xs text-stone-500 truncate max-w-xs">{item.menu_items.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {item.menu_items?.menu_categories?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-stone-900">
                      {formatCurrency(Number(item.price))}
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={item.is_available ? 'success' : 'danger'}>
                        {item.is_available ? 'Available' : 'Unavailable'}
                      </Badge>
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
