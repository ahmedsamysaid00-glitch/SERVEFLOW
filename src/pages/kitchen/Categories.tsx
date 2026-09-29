import { useState, useEffect } from 'react';
import { FolderTree, Plus, Pencil, Trash2, X, GripVertical } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchMenuCategories,
  createMenuCategory,
  updateMenuCategory,
  deleteMenuCategory,
} from '@/services/kitchenService';
import type { MenuCategory } from '@/types';
import { Card, Badge, EmptyState, ErrorState, SkeletonCard, PageTitle } from '@/components/ui';
import { formatDate } from '@/lib/utils';

export default function KitchenCategories() {
  const { restaurant } = useAuth();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCat, setEditingCat] = useState<MenuCategory | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function load() {
    if (!restaurant) return;
    setLoading(true);
    const res = await fetchMenuCategories(restaurant.id);
    if (res.error) { setError(res.error); }
    else { setError(null); setCategories(res.data ?? []); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [refreshKey, restaurant?.id]);

  async function handleToggleActive(cat: MenuCategory) {
    await updateMenuCategory(cat.id, { is_active: !cat.is_active });
    setRefreshKey((k) => k + 1);
  }

  async function handleDelete(cat: MenuCategory) {
    if (!confirm(`Delete category "${cat.name}"? Menu items in this category will also be deleted.`)) return;
    const { error } = await deleteMenuCategory(cat.id);
    if (error) { setError(error); return; }
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Categories"
        subtitle="Manage your menu categories"
        action={
          <button
            onClick={() => { setEditingCat(null); setShowForm(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 text-white px-3 py-2 text-sm font-medium hover:bg-orange-600 transition"
          >
            <Plus className="w-4 h-4" /> Add category
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
      ) : categories.length === 0 ? (
        <Card>
          <EmptyState
            title="No categories yet"
            description="Create your first menu category to organize your food items."
            icon={<FolderTree className="w-6 h-6" />}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card key={cat.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="w-4 h-4 text-stone-300 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900 text-sm truncate">{cat.name}</p>
                    {cat.description && <p className="text-xs text-stone-500 line-clamp-1">{cat.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button onClick={() => { setEditingCat(cat); setShowForm(true); }} className="text-stone-400 hover:text-stone-900 transition">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(cat)} className="text-stone-400 hover:text-red-600 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <Badge variant={cat.is_active ? 'success' : 'neutral'}>
                  {cat.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <button
                  onClick={() => handleToggleActive(cat)}
                  className="text-xs text-stone-500 hover:text-stone-900 transition"
                >
                  {cat.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
              <p className="text-xs text-stone-400 mt-2">Order: {cat.sort_order}</p>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <CategoryForm
          category={editingCat}
          restaurantId={restaurant?.id ?? ''}
          onClose={() => { setShowForm(false); setEditingCat(null); }}
          onSaved={() => { setShowForm(false); setEditingCat(null); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

function CategoryForm({
  category,
  restaurantId,
  onClose,
  onSaved,
}: {
  category: MenuCategory | null;
  restaurantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) { setFormError('Name is required'); return; }
    setSaving(true);
    setFormError(null);
    const sortNum = parseInt(sortOrder) || 0;
    if (category) {
      const { error } = await updateMenuCategory(category.id, {
        name: name.trim(),
        description: description.trim() || null,
        sort_order: sortNum,
      });
      if (error) { setFormError(error); setSaving(false); return; }
    } else {
      const { error } = await createMenuCategory(restaurantId, name.trim(), description.trim() || null, sortNum);
      if (error) { setFormError(error); setSaving(false); return; }
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="font-semibold text-stone-900">{category ? 'Edit category' : 'Add category'}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none"
              placeholder="e.g. Main Dishes"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none"
              placeholder="Optional…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Sort order</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none"
            />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-stone-200 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition">Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="flex-1 rounded-lg bg-orange-500 text-white py-2 text-sm font-medium hover:bg-orange-600 transition disabled:opacity-60">
              {saving ? 'Saving…' : category ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
