import { supabase } from '@/supabase/client';
import type { Branch, Order } from '@/types';
import type { BestSellerItem, OverviewStats, SalesStats, OrderWithRelations, DateRange } from '@/types/derived';

function getDateRangeStart(range: DateRange): string | null {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.toISOString();
  }
  if (range === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return start.toISOString();
  }
  if (range === '30d') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return start.toISOString();
  }
  return null;
}

export async function fetchOverviewStats(
  restaurantId: string,
  branchId: string | null
): Promise<{ data: OverviewStats | null; error: string | null }> {
  try {
    let orderQuery = supabase
      .from('orders')
      .select('id, status, total')
      .eq('restaurant_id', restaurantId);
    if (branchId) orderQuery = orderQuery.eq('branch_id', branchId);
    const { data: orders, error: orderError } = await orderQuery;
    if (orderError) return { data: null, error: orderError.message };

    const { count: customerCount, error: custError } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId);
    if (custError) return { data: null, error: custError.message };

    const { count: branchCount, error: branchError } = await supabase
      .from('branches')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId);
    if (branchError) return { data: null, error: branchError.message };

    const allOrders = orders ?? [];
    const totalRevenue = allOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const completedOrders = allOrders.filter((o) => o.status === 'completed').length;
    const activeOrders = allOrders.filter(
      (o) => !['completed', 'cancelled'].includes(o.status)
    ).length;

    return {
      data: {
        totalOrders: allOrders.length,
        totalRevenue,
        completedOrders,
        activeOrders,
        totalCustomers: customerCount ?? 0,
        branchCount: branchCount ?? 0,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchSalesStats(
  restaurantId: string,
  branchId: string | null,
  range: DateRange
): Promise<{ data: SalesStats | null; error: string | null }> {
  try {
    const start = getDateRangeStart(range);
    let query = supabase
      .from('orders')
      .select('total')
      .eq('restaurant_id', restaurantId);
    if (branchId) query = query.eq('branch_id', branchId);
    if (start) query = query.gte('created_at', start);
    const { data: orders, error } = await query;
    if (error) return { data: null, error: error.message };

    const allOrders = orders ?? [];
    const revenue = allOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const orderCount = allOrders.length;
    const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;

    return { data: { revenue, orderCount, avgOrderValue }, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export async function fetchBestSellers(
  restaurantId: string,
  branchId: string | null,
  limit = 5
): Promise<{ data: BestSellerItem[] | null; error: string | null }> {
  try {
    let orderQuery = supabase
      .from('orders')
      .select('id')
      .eq('restaurant_id', restaurantId);
    if (branchId) orderQuery = orderQuery.eq('branch_id', branchId);
    const { data: orders, error: orderError } = await orderQuery;
    if (orderError) return { data: null, error: orderError.message };

    const orderIds = (orders ?? []).map((o) => o.id);
    if (orderIds.length === 0) return { data: [], error: null };

    const { data: items, error: itemError } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, subtotal')
      .in('order_id', orderIds);
    if (itemError) return { data: null, error: itemError.message };

    const allItems = items ?? [];
    if (allItems.length === 0) return { data: [], error: null };

    const grouped: Record<string, { quantity: number; revenue: number; orders: Set<string> }> = {};
    for (const item of allItems) {
      if (!grouped[item.menu_item_id]) {
        grouped[item.menu_item_id] = { quantity: 0, revenue: 0, orders: new Set() };
      }
      grouped[item.menu_item_id].quantity += item.quantity;
      grouped[item.menu_item_id].revenue += Number(item.subtotal);
    }

    const sortedIds = Object.keys(grouped)
      .sort((a, b) => grouped[b].quantity - grouped[a].quantity)
      .slice(0, limit);

    if (sortedIds.length === 0) return { data: [], error: null };

    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, name, image_url')
      .in('id', sortedIds);
    if (menuError) return { data: null, error: menuError.message };

    const menuMap: Record<string, { name: string; image_url: string | null }> = {};
    for (const mi of menuItems ?? []) {
      menuMap[mi.id] = { name: mi.name, image_url: mi.image_url };
    }

    const result: BestSellerItem[] = sortedIds.map((id) => ({
      menu_item_id: id,
      name: menuMap[id]?.name ?? 'Unknown item',
      image_url: menuMap[id]?.image_url ?? null,
      total_quantity: grouped[id].quantity,
      total_revenue: grouped[id].revenue,
      order_count: grouped[id].orders.size,
    }));

    return { data: result, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export interface OrdersQueryParams {
  restaurantId: string;
  branchId: string | null;
  search?: string;
  status?: string | null;
  paymentStatus?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page: number;
  pageSize: number;
}

export async function fetchOrders(
  params: OrdersQueryParams
): Promise<{ data: OrderWithRelations[] | null; count: number; error: string | null }> {
  try {
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = supabase
      .from('orders')
      .select(
        '*, branches(name), customers(full_name, phone)',
        { count: 'exact' }
      )
      .eq('restaurant_id', params.restaurantId)
      .order('created_at', { ascending: false });

    if (params.branchId) query = query.eq('branch_id', params.branchId);
    if (params.status) query = query.eq('status', params.status);
    if (params.paymentStatus) query = query.eq('payment_status', params.paymentStatus);
    if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
    if (params.dateTo) query = query.lte('created_at', params.dateTo);
    if (params.search) {
      query = query.or(`notes.ilike.%${params.search}%`);
    }

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) return { data: null, count: 0, error: error.message };

    return { data: (data as OrderWithRelations[]) ?? [], count: count ?? 0, error: null };
  } catch (e) {
    return { data: null, count: 0, error: (e as Error).message };
  }
}

export async function fetchBranchesForRestaurant(
  restaurantId: string
): Promise<{ data: Branch[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');
  return { data: data as Branch[] | null, error: error?.message ?? null };
}

export async function fetchSalesByBranch(
  restaurantId: string,
  range: DateRange
): Promise<{ data: { branch: Branch; revenue: number; orderCount: number }[] | null; error: string | null }> {
  try {
    const { data: branches, error: branchError } = await supabase
      .from('branches')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name');
    if (branchError) return { data: null, error: branchError.message };

    const start = getDateRangeStart(range);
    let orderQuery = supabase
      .from('orders')
      .select('branch_id, total')
      .eq('restaurant_id', restaurantId);
    if (start) orderQuery = orderQuery.gte('created_at', start);
    const { data: orders, error: orderError } = await orderQuery;
    if (orderError) return { data: null, error: orderError.message };

    const orderMap: Record<string, { revenue: number; count: number }> = {};
    for (const o of orders ?? []) {
      if (!orderMap[o.branch_id]) orderMap[o.branch_id] = { revenue: 0, count: 0 };
      orderMap[o.branch_id].revenue += Number(o.total);
      orderMap[o.branch_id].count += 1;
    }

    const result = (branches ?? []).map((branch) => ({
      branch,
      revenue: orderMap[branch.id]?.revenue ?? 0,
      orderCount: orderMap[branch.id]?.count ?? 0,
    }));

    return { data: result, error: null };
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
}

export type { Order };
