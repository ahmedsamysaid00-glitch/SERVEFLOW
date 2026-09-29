import { supabase } from '@/supabase/client';
import type { InventoryItem, InventoryTransaction, Order, OrderStatus } from '@/types';
import type {
  BestSellerItem,
  DateRange,
  OrderWithRelations,
  SalesStats,
  OrderItemWithMenu,
} from '@/types/derived';

function getDateRangeStart(range: DateRange): string | null {
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (range === '7d') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === '30d') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

export interface ManagerOverviewStats {
  todayOrders: number;
  todayRevenue: number;
  activeOrders: number;
  completedOrders: number;
  avgOrderValue: number;
  customerCount: number;
  lowStockCount: number;
}

export async function fetchManagerOverview(
  restaurantId: string,
  branchId: string
): Promise<{ data: ManagerOverviewStats | null; error: string | null }> {
  try {
    const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString();

    const { data: todayOrders, error: todayErr } = await supabase
      .from('orders')
      .select('id, status, total')
      .eq('restaurant_id', restaurantId)
      .eq('branch_id', branchId)
      .gte('created_at', todayStart);
    if (todayErr) return { data: null, error: todayErr.message };

    const all = todayOrders ?? [];
    const todayRevenue = all.reduce((s, o) => s + Number(o.total), 0);
    const activeOrders = all.filter((o) => !['completed', 'cancelled'].includes(o.status)).length;
    const completedOrders = all.filter((o) => o.status === 'completed').length;
    const avgOrderValue = all.length > 0 ? todayRevenue / all.length : 0;

    // customers with orders at this branch
    const { count: customerCount, error: custErr } = await supabase
      .from('orders')
      .select('customer_id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('branch_id', branchId)
      .not('customer_id', 'is', null);
    if (custErr) return { data: null, error: custErr.message };

    const { data: invItems, error: invErr } = await supabase
      .from('inventory_items')
      .select('quantity, minimum_quantity')
      .eq('restaurant_id', restaurantId)
      .eq('branch_id', branchId)
      .eq('is_active', true);
    if (invErr) return { data: null, error: invErr.message };

    const lowStockCount = (invItems ?? []).filter(
      (i) => Number(i.quantity) <= Number(i.minimum_quantity)
    ).length;

    return {
      data: {
        todayOrders: all.length,
        todayRevenue,
        activeOrders,
        completedOrders,
        avgOrderValue,
        customerCount: customerCount ?? 0,
        lowStockCount,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchManagerBestSellers(
  restaurantId: string,
  branchId: string,
  limit = 5
): Promise<{ data: BestSellerItem[] | null; error: string | null }> {
  try {
    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('branch_id', branchId);
    if (oErr) return { data: null, error: oErr.message };

    const orderIds = (orders ?? []).map((o) => o.id);
    if (orderIds.length === 0) return { data: [], error: null };

    const { data: items, error: iErr } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, subtotal')
      .in('order_id', orderIds);
    if (iErr) return { data: null, error: iErr.message };

    const grouped: Record<string, { quantity: number; revenue: number }> = {};
    for (const item of items ?? []) {
      if (!grouped[item.menu_item_id]) grouped[item.menu_item_id] = { quantity: 0, revenue: 0 };
      grouped[item.menu_item_id].quantity += item.quantity;
      grouped[item.menu_item_id].revenue += Number(item.subtotal);
    }

    const sortedIds = Object.keys(grouped)
      .sort((a, b) => grouped[b].quantity - grouped[a].quantity)
      .slice(0, limit);
    if (sortedIds.length === 0) return { data: [], error: null };

    const { data: menuItems, error: mErr } = await supabase
      .from('menu_items')
      .select('id, name, image_url')
      .in('id', sortedIds);
    if (mErr) return { data: null, error: mErr.message };

    const menuMap: Record<string, { name: string; image_url: string | null }> = {};
    for (const mi of menuItems ?? []) menuMap[mi.id] = { name: mi.name, image_url: mi.image_url };

    return {
      data: sortedIds.map((id) => ({
        menu_item_id: id,
        name: menuMap[id]?.name ?? 'Unknown',
        image_url: menuMap[id]?.image_url ?? null,
        total_quantity: grouped[id].quantity,
        total_revenue: grouped[id].revenue,
        order_count: 0,
      })),
      error: null,
    };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchManagerSalesStats(
  restaurantId: string,
  branchId: string,
  range: DateRange
): Promise<{ data: SalesStats | null; error: string | null }> {
  try {
    const start = getDateRangeStart(range);
    let query = supabase
      .from('orders')
      .select('total, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('branch_id', branchId);
    if (start) query = query.gte('created_at', start);
    const { data: orders, error } = await query;
    if (error) return { data: null, error: error.message };

    const all = orders ?? [];
    const revenue = all.reduce((s, o) => s + Number(o.total), 0);
    const orderCount = all.length;
    return {
      data: { revenue, orderCount, avgOrderValue: orderCount > 0 ? revenue / orderCount : 0 },
      error: null,
    };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export interface ManagerOrdersParams {
  restaurantId: string;
  branchId: string;
  search?: string;
  status?: string | null;
  paymentStatus?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page: number;
  pageSize: number;
}

export async function fetchManagerOrders(
  params: ManagerOrdersParams
): Promise<{ data: OrderWithRelations[] | null; count: number; error: string | null }> {
  try {
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = supabase
      .from('orders')
      .select('*, branches(name), customers(full_name, phone)', { count: 'exact' })
      .eq('restaurant_id', params.restaurantId)
      .eq('branch_id', params.branchId)
      .order('created_at', { ascending: false });

    if (params.status) query = query.eq('status', params.status);
    if (params.paymentStatus) query = query.eq('payment_status', params.paymentStatus);
    if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
    if (params.dateTo) query = query.lte('created_at', params.dateTo);
    if (params.search) query = query.or(`notes.ilike.%${params.search}%`);

    query = query.range(from, to);
    const { data, count, error } = await query;
    if (error) return { data: null, count: 0, error: error.message };
    return { data: (data as OrderWithRelations[]) ?? [], count: count ?? 0, error: null };
  } catch (e) {
    return { data: null, count: 0, error: (e as Error).message };
  }
}

export async function fetchOrderItems(
  orderId: string
): Promise<{ data: OrderItemWithMenu[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('order_items')
    .select('*, menu_items(name, image_url)')
    .eq('order_id', orderId);
  if (error) return { data: null, error: error.message };
  return { data: (data as OrderItemWithMenu[]) ?? [], error: null };
}

// Manager can update order status — only operational transitions
// (pending → preparing → ready → served → completed, or cancel)
// RLS allows manager to update orders for their branch.
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);
  return { error: error?.message ?? null };
}

export async function fetchManagerInventory(
  restaurantId: string,
  branchId: string
): Promise<{ data: (InventoryItem & { branches?: { name: string } })[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*, branches(name)')
    .eq('restaurant_id', restaurantId)
    .eq('branch_id', branchId)
    .order('name');
  if (error) return { data: null, error: error.message };
  return { data: data as (InventoryItem & { branches?: { name: string } })[], error: null };
}

export async function fetchInventoryTransactions(
  restaurantId: string,
  branchId: string,
  inventoryItemId?: string
): Promise<{ data: (InventoryTransaction & { profiles?: { full_name: string | null } })[] | null; error: string | null }> {
  let query = supabase
    .from('inventory_transactions')
    .select('*, profiles(full_name)')
    .eq('restaurant_id', restaurantId)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });
  if (inventoryItemId) query = query.eq('inventory_item_id', inventoryItemId);
  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data: data as (InventoryTransaction & { profiles?: { full_name: string | null } })[], error: null };
}

export async function adjustInventory(
  _restaurantId: string,
  _branchId: string,
  inventoryItemId: string,
  type: 'purchase' | 'adjustment' | 'waste' | 'transfer_in' | 'transfer_out' | 'consumption',
  quantity: number,
  reason: string | undefined,
  _userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('adjust_inventory', {
    p_inventory_item_id: inventoryItemId,
    p_type: type,
    p_quantity: quantity,
    p_reason: reason ?? null,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function fetchManagerCustomers(
  restaurantId: string,
  branchId: string
): Promise<{ data: { id: string; full_name: string | null; phone: string | null; email: string | null; order_count: number; total_spent: number; last_order_date: string | null }[] | null; error: string | null }> {
  try {
    // Get orders at this branch with customer info
    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id, customer_id, total, created_at, customers(id, full_name, phone, email)')
      .eq('restaurant_id', restaurantId)
      .eq('branch_id', branchId)
      .not('customer_id', 'is', null)
      .order('created_at', { ascending: false });
    if (oErr) return { data: null, error: oErr.message };

    const statsMap: Record<string, { full_name: string | null; phone: string | null; email: string | null; order_count: number; total_spent: number; last_order_date: string | null }> = {};

    for (const order of orders ?? []) {
      const cId = order.customer_id;
      if (!cId) continue;
      const cust = (order as any).customers;
      if (!statsMap[cId]) {
        statsMap[cId] = {
          full_name: cust?.full_name ?? null,
          phone: cust?.phone ?? null,
          email: cust?.email ?? null,
          order_count: 0,
          total_spent: 0,
          last_order_date: null,
        };
      }
      statsMap[cId].order_count += 1;
      statsMap[cId].total_spent += Number(order.total);
      if (!statsMap[cId].last_order_date || order.created_at > statsMap[cId].last_order_date) {
        statsMap[cId].last_order_date = order.created_at;
      }
    }

    return { data: Object.entries(statsMap).map(([id, v]) => ({ id, ...v })), error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchBranchEmployees(
  restaurantId: string,
  branchId: string
): Promise<{ data: { id: string; role: string; status: string; created_at: string; profiles?: { full_name: string | null; phone: string | null; avatar_url: string | null } }[] | null; error: string | null }> {
  try {
    // Get members assigned to this branch plus owner (owner sees all but is listed too)
    const { data, error } = await supabase
      .from('restaurant_members')
      .select('id, role, status, created_at, profiles(full_name, phone, avatar_url)')
      .eq('restaurant_id', restaurantId)
      .or(`branch_id.eq.${branchId},role.eq.owner`)
      .order('created_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as any[], error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchBranchMenu(
  restaurantId: string,
  branchId: string
): Promise<{ data: { id: string; price: number; is_available: boolean; menu_items: { id: string; name: string; description: string | null; image_url: string | null; menu_categories: { name: string } | null } | null }[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('branch_menu_items')
      .select('id, price, is_available, menu_items(id, name, description, image_url, menu_categories(name))')
      .eq('branch_id', branchId)
      .order('updated_at', { ascending: false });
    if (error) return { data: null, error: error.message };
    return { data: data as any[], error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchManagerSalesOverTime(
  restaurantId: string,
  branchId: string,
  range: DateRange
): Promise<{ data: { date: string; revenue: number; orderCount: number }[] | null; error: string | null }> {
  try {
    const start = getDateRangeStart(range);
    let query = supabase
      .from('orders')
      .select('total, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('branch_id', branchId);
    if (start) query = query.gte('created_at', start);
    const { data: orders, error } = await query;
    if (error) return { data: null, error: error.message };

    const dayMap: Record<string, { revenue: number; orderCount: number }> = {};
    for (const o of orders ?? []) {
      const day = o.created_at.slice(0, 10);
      if (!dayMap[day]) dayMap[day] = { revenue: 0, orderCount: 0 };
      dayMap[day].revenue += Number(o.total);
      dayMap[day].orderCount += 1;
    }

    const sortedDays = Object.keys(dayMap).sort();
    return { data: sortedDays.map((d) => ({ date: d, ...dayMap[d] })), error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchPaymentMethodBreakdown(
  restaurantId: string,
  branchId: string,
  range: DateRange
): Promise<{ data: { method: string; count: number; total: number }[] | null; error: string | null }> {
  try {
    const start = getDateRangeStart(range);
    let query = supabase
      .from('orders')
      .select('payment_method, total')
      .eq('restaurant_id', restaurantId)
      .eq('branch_id', branchId);
    if (start) query = query.gte('created_at', start);
    const { data: orders, error } = await query;
    if (error) return { data: null, error: error.message };

    const methodMap: Record<string, { count: number; total: number }> = {};
    for (const o of orders ?? []) {
      const method = o.payment_method ?? 'unknown';
      if (!methodMap[method]) methodMap[method] = { count: 0, total: 0 };
      methodMap[method].count += 1;
      methodMap[method].total += Number(o.total);
    }

    return { data: Object.entries(methodMap).map(([method, v]) => ({ method, ...v })), error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export type { Order };
