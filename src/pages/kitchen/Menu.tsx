import { useState, useEffect, useRef } from 'react';
import { UtensilsCrossed, Plus, Pencil, Trash2, X, Upload, Loader2, Search } from 'lucide-react';
import { supabase } from '@/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchKitchenMenu,
  fetchMenuCategories,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  ensureBranchMenuItem,
  updateBranchPrice,
  updateBranchAvailability,
  uploadMenuImage,
  deleteMenuImage,
  type KitchenMenuItem,
} from '@/services/kitchenService';
import type { MenuCategory } from '@/types';
import { Card, Badge, EmptyState, ErrorState, SkeletonCard, PageTitle, Select } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function KitchenMenu() {
  const { restaurant, branch } = useAuth();
  const [items, setItems] = useState<KitchenMenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<KitchenMenuItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function load() {
    if (!restaurant || !branch) return;
    setLoading(true);
    const [menuRes, catRes] = await Promise.all([
      fetchKitchenMenu(restaurant.id, branch.id),
      fetchMenuCategories(restaurant.id),
    ]);
    if (menuRes.error) { setError(menuRes.error); }
    else { setError(null); setItems(menuRes.data ?? []); }
    if (!catRes.error) setCategories(catRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [refreshKey, restaurant?.id, branch?.id]);

  const filtered = items.filter((item) => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && item.category_id !== categoryFilter) return false;
    if (availabilityFilter === 'available' && !item.branch_menu_items.some((b) => b.is_available)) return false;
    if (availabilityFilter === 'unavailable' && !item.branch_menu_items.some((b) => !b.is_available)) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <PageTitle
        title="Menu"
        subtitle={`Manage food items and pricing for ${branch?.name ?? 'your branch'}`}
        action={
          <button
            onClick={() => { setEditingItem(null); setShowForm(true); }}
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 text-white px-3 py-2 text-sm font-medium hover:bg-orange-600 transition"
          >
            <Plus className="w-4 h-4" /> Add food
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full sm:w-56 rounded-lg border border-stone-300 bg-white pl-9 pr-3 py-2 text-sm text-stone-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none"
          />
        </div>
        <Select value={categoryFilter} onChange={setCategoryFilter}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={availabilityFilter} onChange={setAvailabilityFilter}>
          <option value="">All items</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </Select>
        <span className="text-sm text-stone-500 ml-auto">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="No menu items"
            description="Add your first food item to get started."
            icon={<UtensilsCrossed className="w-6 h-6" />}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <MenuCard
              key={item.id}
              item={item}
              branchId={branch?.id ?? ''}
              onEdit={() => { setEditingItem(item); setShowForm(true); }}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <MenuForm
          item={editingItem}
          categories={categories}
          restaurantId={restaurant?.id ?? ''}
          branchId={branch?.id ?? ''}
          onClose={() => { setShowForm(false); setEditingItem(null); }}
          onSaved={() => { setShowForm(false); setEditingItem(null); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

function MenuCard({
  item,
  branchId,
  onEdit,
  onRefresh,
}: {
  item: KitchenMenuItem;
  branchId: string;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const branchItem = item.branch_menu_items[0];
  const [toggling, setToggling] = useState(false);
  const [priceEdit, setPriceEdit] = useState(false);
  const [priceValue, setPriceValue] = useState(branchItem ? String(branchItem.price) : '');
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  async function toggleAvailability() {
    if (!branchItem) return;
    setToggling(true);
    await updateBranchAvailability(branchItem.id, !branchItem.is_available);
    setToggling(false);
    onRefresh();
  }

  async function savePrice() {
    if (!branchItem) return;
    const val = parseFloat(priceValue);
    if (isNaN(val) || val < 0) { setPriceError('Enter a valid price'); return; }
    setSavingPrice(true);
    setPriceError(null);
    const { error } = await updateBranchPrice(branchItem.id, val);
    setSavingPrice(false);
    if (error) { setPriceError(error); return; }
    setPriceEdit(false);
    onRefresh();
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative h-32 bg-stone-100">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300">
            <UtensilsCrossed className="w-8 h-8" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          {branchItem ? (
            <Badge variant={branchItem.is_available ? 'success' : 'danger'}>
              {branchItem.is_available ? 'Available' : 'Unavailable'}
            </Badge>
          ) : (
            <Badge variant="warning">Not configured</Badge>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between mb-1">
          <div className="min-w-0">
            <p className="font-semibold text-stone-900 text-sm truncate">{item.name}</p>
            <p className="text-xs text-stone-500">{item.menu_categories?.name ?? 'Uncategorized'}</p>
          </div>
          <button onClick={onEdit} className="text-stone-400 hover:text-stone-900 transition shrink-0 ml-2">
            <Pencil className="w-4 h-4" />
          </button>
        </div>
        {item.description && (
          <p className="text-xs text-stone-500 line-clamp-2 mb-3">{item.description}</p>
        )}

        {/* Price section */}
        <div className="mb-3">
          {branchItem ? (
            priceEdit ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceValue}
                  onChange={(e) => setPriceValue(e.target.value)}
                  className="w-24 rounded-lg border border-stone-300 px-2 py-1 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none"
                />
                <button
                  onClick={savePrice}
                  disabled={savingPrice}
                  className="rounded-lg bg-orange-500 text-white px-2 py-1 text-xs font-medium hover:bg-orange-600 transition disabled:opacity-60"
                >
                  {savingPrice ? '…' : 'Save'}
                </button>
                <button onClick={() => setPriceEdit(false)} className="text-xs text-stone-500 hover:text-stone-900">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setPriceEdit(true)} className="text-lg font-semibold text-stone-900 hover:text-orange-600 transition">
                {formatCurrency(branchItem.price)}
              </button>
            )
          ) : (
            <p className="text-sm text-stone-400">No price set for this branch</p>
          )}
          {priceError && <p className="text-xs text-red-600 mt-1">{priceError}</p>}
        </div>

        {/* Availability toggle */}
        {branchItem && (
          <button
            onClick={toggleAvailability}
            disabled={toggling}
            className={`w-full rounded-lg py-1.5 text-sm font-medium transition disabled:opacity-60 ${
              branchItem.is_available
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {toggling ? '…' : branchItem.is_available ? 'Mark unavailable' : 'Mark available'}
          </button>
        )}
        <p className="text-xs text-stone-400 mt-2 text-center">Updated {formatDate(item.updated_at).split(',')[0]}</p>
      </div>
    </Card>
  );
}

function MenuForm({
  item,
  categories,
  restaurantId,
  branchId,
  onClose,
  onSaved,
}: {
  item: KitchenMenuItem | null;
  categories: MenuCategory[];
  restaurantId: string;
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories[0]?.id ?? '');
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? '');
  const [price, setPrice] = useState(item?.branch_menu_items[0] ? String(item.branch_menu_items[0].price) : '');
  const [isAvailable, setIsAvailable] = useState(item?.branch_menu_items[0]?.is_available ?? true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);
    const res = await uploadMenuImage(restaurantId, file);
    setUploading(false);
    if (res.error) { setFormError(res.error); return; }
    if (res.url) setImageUrl(res.url);
  }

  async function handleRemoveImage() {
    if (imageUrl) await deleteMenuImage(imageUrl);
    setImageUrl('');
  }

  async function handleSubmit() {
    if (!name.trim()) { setFormError('Name is required'); return; }
    if (!categoryId) { setFormError('Category is required'); return; }
    setSaving(true);
    setFormError(null);

    try {
      if (item) {
        // Edit existing
        const { error } = await updateMenuItem(item.id, {
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl || null,
          category_id: categoryId,
        });
        if (error) { setFormError(error); setSaving(false); return; }

        // Update branch price/availability if branch item exists
        if (item.branch_menu_items[0]) {
          const priceVal = parseFloat(price);
          if (!isNaN(priceVal) && priceVal >= 0) {
            await updateBranchPrice(item.branch_menu_items[0].id, priceVal);
          }
          await updateBranchAvailability(item.branch_menu_items[0].id, isAvailable);
        } else {
          // Create branch menu item
          const priceVal = parseFloat(price);
          if (!isNaN(priceVal) && priceVal >= 0) {
            await ensureBranchMenuItem(branchId, item.id, priceVal);
          }
        }
      } else {
        // Create new
        const { data: newItem, error: createError } = await createMenuItem(
          restaurantId,
          categoryId,
          name.trim(),
          description.trim() || null,
          imageUrl || null
        );
        if (createError) { setFormError(createError); setSaving(false); return; }

        // Create branch menu item with price
        const priceVal = parseFloat(price);
        const finalPrice = !isNaN(priceVal) && priceVal >= 0 ? priceVal : 0;
        const { data: bmi } = await ensureBranchMenuItem(branchId, newItem!.id, finalPrice);
        if (!isAvailable && bmi) {
          await updateBranchAvailability(bmi.id, false);
        }
      }
      setSaving(false);
      onSaved();
    } catch (e) {
      setFormError((e as Error).message);
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirm(`Delete "${item.name}"? This will remove it from all branches.`)) return;
    setSaving(true);
    const { error } = await deleteMenuItem(item.id);
    setSaving(false);
    if (error) { setFormError(error); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-stone-900">{item ? 'Edit food item' : 'Add food item'}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-900"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Food image</label>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <div className="relative">
                  <img src={imageUrl} alt="Preview" className="w-20 h-20 rounded-lg object-cover" />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
                  >×</button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg bg-stone-100 flex items-center justify-center text-stone-300">
                  <UtensilsCrossed className="w-6 h-6" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 transition disabled:opacity-60"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none"
              placeholder="e.g. Margherita Pizza"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none resize-none"
              placeholder="Short description…"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none"
            >
              {categories.length === 0 && <option value="">No categories — create one first</option>}
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Price for {branchId ? 'this branch' : 'branch'} (EGP)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none"
              placeholder="0.00"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAvailable}
              onChange={(e) => setIsAvailable(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-orange-500 focus:ring-orange-500/20"
            />
            <span className="text-sm text-stone-700">Available at this branch</span>
          </label>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex gap-2 pt-2">
            {item && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="rounded-lg border border-red-200 text-red-600 px-3 py-2 text-sm font-medium hover:bg-red-50 transition disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="flex-1 rounded-lg border border-stone-200 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 rounded-lg bg-orange-500 text-white py-2 text-sm font-medium hover:bg-orange-600 transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : item ? 'Save changes' : 'Create item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
