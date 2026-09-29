import { supabase } from '@/supabase/client';
import type { MenuCategory, MenuItem, OrderStatus, InventoryItem } from '@/types';

// ─── Queries ───────────────────────────────────────────────────────────────

export interface KitchenOrderStats {
  pending: number;
  preparing: number;
  ready: number;
  completedToday: number;
  cancelledToday: number;
}

export async function fetchKitchenOrderStats(
  restaurantId: string,
  branchId: string
): Promise<{ data: KitchenOrderStats | null; error: string | null }> {
  try {
    const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString();
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('branch_id', branchId);
    if (error) return { data: null, error: error.message };

    const all = orders ?? [];
    const todayOrders = all.filter((o) => o.created_at >= todayStart);

    return {
      data: {
        pending: all.filter((o) => o.status === 'pending').length,
        preparing: all.filter((o) => o.status === 'preparing').length,
        ready: all.filter((o) => o.status === 'ready').length,
        completedToday: todayOrders.filter((o) => o.status === 'completed').length,
        cancelledToday: todayOrders.filter((o) => o.status === 'cancelled').length,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchUnavailableItemCount(
  restaurantId: string,
  branchId: string
): Promise<{ data: number | null; error: string | null }> {
  const { count, error } = await supabase
    .from('branch_menu_items')
    .select('*', { count: 'exact', head: true })
    .eq('branch_id', branchId)
    .eq('is_available', false);
  if (error) return { data: null, error: error.message };
  return { data: count ?? 0, error: null };
}

export interface KitchenOrderRow {
  id: string;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
  customers: { full_name: string | null } | null;
}

export async function fetchKitchenOrders(
  restaurantId: string,
  branchId: string
): Promise<{ data: KitchenOrderRow[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, notes, created_at, customers(full_name)')
    .eq('restaurant_id', restaurantId)
    .eq('branch_id', branchId)
    .in('status', ['pending', 'preparing', 'ready'])
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: error.message };
  return { data: data as unknown as KitchenOrderRow[], error: null };
}

export async function fetchOrderItemsForKitchen(
  orderId: string
): Promise<{ data: { id: string; quantity: number; menu_item_id: string; menu_items: { name: string } | null }[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('order_items')
    .select('id, quantity, menu_item_id, menu_items(name)')
    .eq('order_id', orderId);
  if (error) return { data: null, error: error.message };
  return { data: data as any, error: null };
}

export async function fetchCompletedOrders(
  restaurantId: string,
  branchId: string,
  page: number,
  pageSize: number
): Promise<{ data: KitchenOrderRow[] | null; count: number; error: string | null }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from('orders')
    .select('id, status, notes, created_at, customers(full_name)', { count: 'exact' })
    .eq('restaurant_id', restaurantId)
    .eq('branch_id', branchId)
    .in('status', ['completed', 'served', 'cancelled'])
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) return { data: null, count: 0, error: error.message };
  return { data: data as unknown as KitchenOrderRow[], count: count ?? 0, error: null };
}

// ─── Menu Management ───────────────────────────────────────────────────────

export async function fetchMenuCategories(
  restaurantId: string
): Promise<{ data: MenuCategory[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order');
  if (error) return { data: null, error: error.message };
  return { data: data as MenuCategory[], error: null };
}

export async function createMenuCategory(
  restaurantId: string,
  name: string,
  description: string | null,
  sortOrder: number
): Promise<{ data: MenuCategory | null; error: string | null }> {
  const { data, error } = await supabase
    .from('menu_categories')
    .insert({ restaurant_id: restaurantId, name, description, sort_order: sortOrder })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as MenuCategory, error: null };
}

export async function updateMenuCategory(
  categoryId: string,
  updates: { name?: string; description?: string | null; sort_order?: number; is_active?: boolean }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('menu_categories').update(updates).eq('id', categoryId);
  return { error: error?.message ?? null };
}

export async function deleteMenuCategory(categoryId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('menu_categories').delete().eq('id', categoryId);
  return { error: error?.message ?? null };
}

export interface KitchenMenuItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category_id: string;
  updated_at: string;
  menu_categories: { name: string; is_active: boolean } | null;
  branch_menu_items: { id: string; price: number; is_available: boolean }[];
}

export async function fetchKitchenMenu(
  restaurantId: string,
  branchId: string
): Promise<{ data: KitchenMenuItem[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, description, image_url, category_id, updated_at, menu_categories(name, is_active)')
    .eq('restaurant_id', restaurantId)
    .order('name');
  if (error) return { data: null, error: error.message };

  const menuItemIds = (data ?? []).map((m) => m.id);
  if (menuItemIds.length === 0) return { data: [], error: null };

  const { data: branchItems, error: bmiError } = await supabase
    .from('branch_menu_items')
    .select('id, menu_item_id, price, is_available')
    .eq('branch_id', branchId)
    .in('menu_item_id', menuItemIds);
  if (bmiError) return { data: null, error: bmiError.message };

  const branchMap: Record<string, { id: string; price: number; is_available: boolean }> = {};
  for (const bi of branchItems ?? []) {
    branchMap[bi.menu_item_id] = { id: bi.id, price: Number(bi.price), is_available: bi.is_available };
  }

  const result: KitchenMenuItem[] = (data ?? []).map((mi) => ({
    id: mi.id,
    name: mi.name,
    description: mi.description,
    image_url: mi.image_url,
    category_id: mi.category_id,
    updated_at: mi.updated_at,
    menu_categories: (mi as any).menu_categories,
    branch_menu_items: branchMap[mi.id] ? [branchMap[mi.id]] : [],
  }));

  return { data: result, error: null };
}

export async function createMenuItem(
  restaurantId: string,
  categoryId: string,
  name: string,
  description: string | null,
  imageUrl: string | null
): Promise<{ data: MenuItem | null; error: string | null }> {
  const { data, error } = await supabase
    .from('menu_items')
    .insert({ restaurant_id: restaurantId, category_id: categoryId, name, description, image_url: imageUrl })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as MenuItem, error: null };
}

export async function updateMenuItem(
  itemId: string,
  updates: { name?: string; description?: string | null; image_url?: string | null; category_id?: string }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('menu_items').update(updates).eq('id', itemId);
  return { error: error?.message ?? null };
}

export async function deleteMenuItem(itemId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('menu_items').delete().eq('id', itemId);
  return { error: error?.message ?? null };
}

// ─── Branch Menu Items (price + availability) ────────────────────────────

export async function ensureBranchMenuItem(
  branchId: string,
  menuItemId: string,
  price: number
): Promise<{ data: { id: string } | null; error: string | null }> {
  const { data: existing } = await supabase
    .from('branch_menu_items')
    .select('id')
    .eq('branch_id', branchId)
    .eq('menu_item_id', menuItemId)
    .maybeSingle();

  if (existing) {
    return { data: { id: (existing as any).id }, error: null };
  }

  const { data, error } = await supabase
    .from('branch_menu_items')
    .insert({ branch_id: branchId, menu_item_id: menuItemId, price, is_available: true })
    .select('id')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: { id: (data as any).id }, error: null };
}

export async function updateBranchPrice(
  branchMenuItemId: string,
  price: number
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('branch_menu_items')
    .update({ price })
    .eq('id', branchMenuItemId);
  return { error: error?.message ?? null };
}

export async function updateBranchAvailability(
  branchMenuItemId: string,
  isAvailable: boolean
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('branch_menu_items')
    .update({ is_available: isAvailable })
    .eq('id', branchMenuItemId);
  return { error: error?.message ?? null };
}

// ─── Order Status ──────────────────────────────────────────────────────────

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
  return { error: error?.message ?? null };
}

// ─── Inventory (read-only awareness) ────────────────────────────────────────

export async function fetchKitchenInventory(
  restaurantId: string,
  branchId: string
): Promise<{ data: InventoryItem[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, name, unit, quantity, minimum_quantity, is_active')
    .eq('restaurant_id', restaurantId)
    .eq('branch_id', branchId)
    .eq('is_active', true)
    .order('name');
  if (error) return { data: null, error: error.message };
  return { data: data as InventoryItem[], error: null };
}

// ─── Image Upload ──────────────────────────────────────────────────────────

export async function uploadMenuImage(
  restaurantId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  try {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const fileName = `restaurants/${restaurantId}/menu/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('restaurant-assets')
      .upload(fileName, file, { contentType: file.type, upsert: false });
    if (uploadError) return { url: null, error: uploadError.message };

    const { data: urlData } = supabase.storage
      .from('restaurant-assets')
      .getPublicUrl(fileName);

    return { url: urlData.publicUrl, error: null };
  } catch (e) {
    return { url: null, error: (e as Error).message };
  }
}

export async function deleteMenuImage(imageUrl: string): Promise<{ error: string | null }> {
  try {
    const url = new URL(imageUrl);
    const path = url.pathname.split('/restaurant-assets/')[1];
    if (!path) return { error: null };
    const { error } = await supabase.storage.from('restaurant-assets').remove([path]);
    return { error: error?.message ?? null };
  } catch {
    return { error: null };
  }
}
