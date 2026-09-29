import { supabase } from '@/supabase/client';
import type { Customer, InventoryItem, MenuCategory, MenuItem, BranchMenuItem, RestaurantMember } from '@/types';
import type {
  CustomerWithStats,
  EmployeeWithProfile,
  MenuItemWithCategory,
  BranchMenuItemWithRelations,
} from '@/types/derived';

export async function fetchMenuOverview(
  restaurantId: string,
  branchId: string | null
): Promise<{ data: BranchMenuItemWithRelations[] | null; error: string | null }> {
  try {
    if (branchId) {
      const { data, error } = await supabase
        .from('branch_menu_items')
        .select(
          '*, branches(name), menu_items(id, name, description, image_url, menu_categories(name))'
        )
        .eq('branch_id', branchId)
        .order('updated_at', { ascending: false });
      if (error) return { data: null, error: error.message };
      return { data: data as BranchMenuItemWithRelations[], error: null };
    }

    // All branches: get all menu items for the restaurant, then all branch_menu_items
    const { data: menuItems, error: miError } = await supabase
      .from('menu_items')
      .select('id, name, description, image_url, restaurant_id, category_id, created_at, updated_at, menu_categories(name)')
      .eq('restaurant_id', restaurantId)
      .order('name');
    if (miError) return { data: null, error: miError.message };

    const menuItemIds = (menuItems ?? []).map((m) => m.id);
    if (menuItemIds.length === 0) return { data: [], error: null };

    const { data: branchItems, error: bmiError } = await supabase
      .from('branch_menu_items')
      .select('*, branches(name)')
      .in('menu_item_id', menuItemIds)
      .order('updated_at', { ascending: false });
    if (bmiError) return { data: null, error: bmiError.message };

    const menuMap: Record<string, MenuItemWithCategory> = {};
    for (const mi of (menuItems ?? []) as any[]) {
      const cat = Array.isArray(mi.menu_categories) ? mi.menu_categories[0] : mi.menu_categories;
      menuMap[mi.id] = { ...mi, menu_categories: cat };
    }

    const result: BranchMenuItemWithRelations[] = (branchItems ?? []).map((bmi) => ({
      ...bmi,
      menu_items: menuMap[bmi.menu_item_id] ?? undefined,
    }));

    return { data: result, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchCustomers(
  restaurantId: string
): Promise<{ data: CustomerWithStats[] | null; error: string | null }> {
  try {
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };

    const allCustomers = customers as Customer[];
    if (allCustomers.length === 0) return { data: [], error: null };

    const customerIds = allCustomers.map((c) => c.id);
    const { data: orders, error: orderError } = await supabase
      .from('orders')
      .select('customer_id, total, created_at')
      .in('customer_id', customerIds);
    if (orderError) return { data: null, error: orderError.message };

    const statsMap: Record<string, { count: number; spent: number; lastDate: string | null }> = {};
    for (const o of orders ?? []) {
      if (!o.customer_id) continue;
      if (!statsMap[o.customer_id]) {
        statsMap[o.customer_id] = { count: 0, spent: 0, lastDate: null };
      }
      statsMap[o.customer_id].count += 1;
      statsMap[o.customer_id].spent += Number(o.total);
      if (!statsMap[o.customer_id].lastDate || o.created_at > statsMap[o.customer_id].lastDate!) {
        statsMap[o.customer_id].lastDate = o.created_at;
      }
    }

    const result: CustomerWithStats[] = allCustomers.map((c) => ({
      ...c,
      order_count: statsMap[c.id]?.count ?? 0,
      total_spent: statsMap[c.id]?.spent ?? 0,
      last_order_date: statsMap[c.id]?.lastDate ?? null,
    }));

    return { data: result, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchInventory(
  restaurantId: string,
  branchId: string | null
): Promise<{ data: InventoryItem[] | null; error: string | null }> {
  try {
    let query = supabase
      .from('inventory_items')
      .select('*, branches(name)')
      .eq('restaurant_id', restaurantId)
      .order('name');
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) return { data: null, error: error.message };
    return { data: data as InventoryItem[], error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchEmployees(
  restaurantId: string
): Promise<{ data: EmployeeWithProfile[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('restaurant_members')
      .select('*, profiles(full_name, phone, avatar_url), branches(name)')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as EmployeeWithProfile[], error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchMenuCategories(
  restaurantId: string
): Promise<{ data: MenuCategory[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('sort_order');
  return { data: data as MenuCategory[] | null, error: error?.message ?? null };
}

export async function fetchMenuItems(
  restaurantId: string
): Promise<{ data: MenuItem[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');
  return { data: data as MenuItem[] | null, error: error?.message ?? null };
}

export async function fetchRestaurantMembers(
  restaurantId: string
): Promise<{ data: RestaurantMember[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('restaurant_members')
    .select('*')
    .eq('restaurant_id', restaurantId);
  return { data: data as RestaurantMember[] | null, error: error?.message ?? null };
}

export async function fetchBranchMenuItemsCount(
  restaurantId: string
): Promise<{ data: { totalMenuItems: number; totalBranchMenuItems: number } | null; error: string | null }> {
  const { count: menuCount } = await supabase
    .from('menu_items')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId);

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id')
    .eq('restaurant_id', restaurantId);

  const ids = (menuItems ?? []).map((m) => m.id);
  let branchMenuCount = 0;
  if (ids.length > 0) {
    const { count } = await supabase
      .from('branch_menu_items')
      .select('*', { count: 'exact', head: true })
      .in('menu_item_id', ids);
    branchMenuCount = count ?? 0;
  }

  return {
    data: { totalMenuItems: menuCount ?? 0, totalBranchMenuItems: branchMenuCount },
    error: null,
  };
}
