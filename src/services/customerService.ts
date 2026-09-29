import { supabase } from '@/supabase/client';
import type { MenuCategory, Customer, OrderStatus, PaymentStatus, PaymentMethod, Branch, Restaurant } from '@/types';

// ─── Customer identity ─────────────────────────────────────────────────────

export interface CustomerIdentity {
  id: string;
  restaurant_id: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
}

export async function fetchCustomerIdentity(): Promise<{ data: CustomerIdentity | null; error: string | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('customers')
    .select('id, restaurant_id, full_name, phone, email, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as CustomerIdentity | null, error: null };
}

// ─── Marketplace: all active restaurants with at least one active branch ─────

export interface MarketplaceRestaurant {
  id: string;
  name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
}

export async function fetchMarketplaceRestaurants(): Promise<{ data: MarketplaceRestaurant[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('active_restaurants_with_branches');
  if (error) return { data: null, error: error.message };
  return { data: data as MarketplaceRestaurant[], error: null };
}

// ─── Single restaurant info ─────────────────────────────────────────────────

export async function fetchRestaurant(
  restaurantId: string
): Promise<{ data: Restaurant | null; error: string | null }> {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as Restaurant | null, error: null };
}

// ─── Branches for a specific restaurant ─────────────────────────────────────

export async function fetchBranches(
  restaurantId: string
): Promise<{ data: Branch[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('name');
  if (error) return { data: null, error: error.message };
  return { data: data as Branch[], error: null };
}

// ─── Single branch info (with restaurant validation) ────────────────────────

export async function fetchBranch(
  branchId: string,
  restaurantId: string
): Promise<{ data: Branch | null; error: string | null }> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as Branch | null, error: null };
}

// ─── Menu for a specific branch ─────────────────────────────────────────────

export interface CustomerMenuItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category_id: string;
  price: number;
  category_name: string;
  available: boolean;
}

export async function fetchBranchMenu(
  restaurantId: string,
  branchId: string
): Promise<{ data: CustomerMenuItem[] | null; error: string | null }> {
  const { data: menuItems, error: miError } = await supabase
    .from('menu_items')
    .select('id, name, description, image_url, category_id, menu_categories(name)')
    .eq('restaurant_id', restaurantId)
    .order('name');
  if (miError) return { data: null, error: miError.message };

  const { data: branchItems, error: bmiError } = await supabase
    .from('branch_menu_items')
    .select('menu_item_id, price, is_available')
    .eq('branch_id', branchId);
  if (bmiError) return { data: null, error: bmiError.message };

  const branchMap: Record<string, { price: number; is_available: boolean }> = {};
  for (const bi of branchItems ?? []) {
    branchMap[bi.menu_item_id] = { price: Number(bi.price), is_available: bi.is_available };
  }

  const result: CustomerMenuItem[] = (menuItems ?? [])
    .filter((mi) => branchMap[mi.id])
    .map((mi) => ({
      id: mi.id,
      name: mi.name,
      description: mi.description,
      image_url: mi.image_url,
      category_id: mi.category_id,
      price: branchMap[mi.id].price,
      category_name: (mi as any).menu_categories?.name ?? 'Uncategorized',
      available: branchMap[mi.id].is_available,
    }));

  return { data: result, error: null };
}

// ─── Menu categories for a restaurant ───────────────────────────────────────

export async function fetchCustomerCategories(
  restaurantId: string
): Promise<{ data: MenuCategory[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('sort_order');
  if (error) return { data: null, error: error.message };
  return { data: data as MenuCategory[], error: null };
}

// ─── Order creation via RPC ─────────────────────────────────────────────────

export interface CustomerCartItem {
  menu_item_id: string;
  quantity: number;
}

export interface CreateCustomerOrderResult {
  order_id: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  item_count: number;
}

export async function createCustomerOrder(params: {
  branchId: string;
  cartItems: CustomerCartItem[];
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  idempotencyKey: string;
}): Promise<{ data: CreateCustomerOrderResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_customer_order', {
    p_branch_id: params.branchId,
    p_cart_items: params.cartItems as any,
    p_payment_method: params.paymentMethod,
    p_notes: params.notes,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as CreateCustomerOrderResult, error: null };
}

// ─── My Orders ────────────────────────────────────────────────────────────────

export interface CustomerOrderRow {
  id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  total: number;
  created_at: string;
  notes: string | null;
  branches: { name: string } | null;
  restaurants: { name: string } | null;
}

export async function fetchCustomerOrders(
  filters: {
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  },
  page: number,
  pageSize: number
): Promise<{ data: CustomerOrderRow[] | null; count: number; error: string | null }> {
  let query = supabase
    .from('orders')
    .select('id, status, payment_status, payment_method, total, created_at, notes, branches(name), restaurants(name)', { count: 'exact' });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59');

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) return { data: null, count: 0, error: error.message };
  return { data: data as unknown as CustomerOrderRow[], count: count ?? 0, error: null };
}

export interface CustomerOrderDetail extends CustomerOrderRow {
  subtotal: number;
  discount: number;
  tax: number;
  branch_id: string;
  order_items: {
    id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    menu_items: { name: string } | null;
  }[];
}

export async function fetchCustomerOrderDetail(
  orderId: string
): Promise<{ data: CustomerOrderDetail | null; error: string | null }> {
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, payment_status, payment_method, total, subtotal, discount, tax, created_at, notes, branch_id, branches(name), restaurants(name)')
    .eq('id', orderId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!order) return { data: null, error: 'Order not found' };

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('id, quantity, unit_price, subtotal, menu_items(name)')
    .eq('order_id', orderId);
  if (itemsError) return { data: null, error: itemsError.message };

  return {
    data: {
      ...(order as any),
      order_items: (items ?? []) as any,
    } as CustomerOrderDetail,
    error: null,
  };
}

// ─── Latest order (for home page) ─────────────────────────────────────────────

export async function fetchLatestCustomerOrder(): Promise<{ data: CustomerOrderRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, payment_status, payment_method, total, created_at, notes, branches(name), restaurants(name)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as unknown as CustomerOrderRow | null, error: null };
}

// ─── Profile update ────────────────────────────────────────────────────────────

export async function updateCustomerProfile(
  customerId: string,
  updates: { full_name?: string | null; phone?: string | null; email?: string | null }
): Promise<{ data: Customer | null; error: string | null }> {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', customerId)
    .select('*')
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as Customer | null, error: null };
}

// ─── Customer signup (no restaurant required) ────────────────────────────────

export interface CustomerSignupResult {
  customer_id: string;
}

export async function createCustomerAccount(): Promise<{ data: CustomerSignupResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_customer_account');
  if (error) return { data: null, error: error.message };
  return { data: data as CustomerSignupResult, error: null };
}
