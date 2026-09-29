import { supabase } from '@/supabase/client';
import type { MenuCategory, Customer, PaymentMethod, OrderStatus, PaymentStatus } from '@/types';

// ─── POS: Menu for branch ──────────────────────────────────────────────────

export interface POSMenuItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category_id: string;
  price: number;
  is_available: boolean;
  category_name: string;
}

export async function fetchPOSMenu(
  restaurantId: string,
  branchId: string
): Promise<{ data: POSMenuItem[] | null; error: string | null }> {
  // Fetch menu items with categories
  const { data: menuItems, error: miError } = await supabase
    .from('menu_items')
    .select('id, name, description, image_url, category_id, menu_categories(name)')
    .eq('restaurant_id', restaurantId)
    .order('name');
  if (miError) return { data: null, error: miError.message };

  // Fetch branch_menu_items for this branch
  const { data: branchItems, error: bmiError } = await supabase
    .from('branch_menu_items')
    .select('menu_item_id, price, is_available')
    .eq('branch_id', branchId);
  if (bmiError) return { data: null, error: bmiError.message };

  const branchMap: Record<string, { price: number; is_available: boolean }> = {};
  for (const bi of branchItems ?? []) {
    branchMap[bi.menu_item_id] = { price: Number(bi.price), is_available: bi.is_available };
  }

  const result: POSMenuItem[] = (menuItems ?? [])
    .filter((mi) => branchMap[mi.id] && branchMap[mi.id].is_available)
    .map((mi) => ({
      id: mi.id,
      name: mi.name,
      description: mi.description,
      image_url: mi.image_url,
      category_id: mi.category_id,
      price: branchMap[mi.id].price,
      is_available: true,
      category_name: (mi as any).menu_categories?.name ?? 'Uncategorized',
    }));

  return { data: result, error: null };
}

export async function fetchPOSCategories(
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

// ─── Customer search + create ──────────────────────────────────────────────

export async function searchCustomers(
  restaurantId: string,
  query: string
): Promise<{ data: Customer[] | null; error: string | null }> {
  if (!query.trim()) return { data: [], error: null };
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(10);
  if (error) return { data: null, error: error.message };
  return { data: data as Customer[], error: null };
}

export async function createCustomer(
  restaurantId: string,
  fullName: string,
  phone: string | null,
  email: string | null
): Promise<{ data: Customer | null; error: string | null }> {
  const { data, error } = await supabase
    .from('customers')
    .insert({ restaurant_id: restaurantId, full_name: fullName, phone, email })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as Customer, error: null };
}

// ─── Order creation via RPC ─────────────────────────────────────────────────

export interface CartItem {
  menu_item_id: string;
  quantity: number;
}

export interface CreateOrderResult {
  order_id: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  item_count: number;
}

export async function createCashierOrder(params: {
  cartItems: CartItem[];
  customerId: string | null;
  discount: number;
  taxRate: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
  idempotencyKey: string;
}): Promise<{ data: CreateOrderResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_cashier_order', {
    p_cart_items: params.cartItems as any,
    p_customer_id: params.customerId,
    p_discount: params.discount,
    p_tax_rate: params.taxRate,
    p_payment_method: params.paymentMethod,
    p_notes: params.notes,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as CreateOrderResult, error: null };
}

// ─── Orders page ────────────────────────────────────────────────────────────

export interface CashierOrderRow {
  id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  total: number;
  created_at: string;
  notes: string | null;
  customers: { full_name: string | null } | null;
}

export async function fetchCashierOrders(
  restaurantId: string,
  branchId: string,
  filters: {
    status?: string;
    paymentStatus?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  },
  page: number,
  pageSize: number
): Promise<{ data: CashierOrderRow[] | null; count: number; error: string | null }> {
  let query = supabase
    .from('orders')
    .select('id, status, payment_status, payment_method, total, created_at, notes, customers(full_name)', { count: 'exact' })
    .eq('restaurant_id', restaurantId)
    .eq('branch_id', branchId);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59');

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
  if (error) return { data: null, count: 0, error: error.message };

  let rows = data as unknown as CashierOrderRow[];
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter((r) =>
      r.id.toLowerCase().includes(q) || (r.customers?.full_name?.toLowerCase().includes(q) ?? false)
    );
  }

  return { data: rows, count: count ?? 0, error: null };
}

export interface OrderDetailRow extends CashierOrderRow {
  subtotal: number;
  discount: number;
  tax: number;
  cashier_id: string | null;
  order_items: {
    id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    menu_items: { name: string } | null;
  }[];
}

export async function fetchOrderDetail(
  orderId: string,
  branchId: string
): Promise<{ data: OrderDetailRow | null; error: string | null }> {
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, status, payment_status, payment_method, total, subtotal, discount, tax, created_at, notes, cashier_id, customers(full_name)')
    .eq('id', orderId)
    .eq('branch_id', branchId)
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
    } as OrderDetailRow,
    error: null,
  };
}

// ─── Shift management ──────────────────────────────────────────────────────

export interface CashierShift {
  id: string;
  restaurant_id: string;
  branch_id: string;
  cashier_id: string;
  starting_cash: number;
  ending_cash: number | null;
  expected_cash: number;
  cash_difference: number;
  opened_at: string;
  closed_at: string | null;
  status: 'open' | 'closed';
}

export async function fetchActiveShift(
  cashierId: string
): Promise<{ data: CashierShift | null; error: string | null }> {
  const { data, error } = await supabase
    .from('cashier_shifts')
    .select('*')
    .eq('cashier_id', cashierId)
    .eq('status', 'open')
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as CashierShift | null, error: null };
}

export async function openShift(
  restaurantId: string,
  branchId: string,
  cashierId: string,
  startingCash: number
): Promise<{ data: CashierShift | null; error: string | null }> {
  const { data, error } = await supabase
    .from('cashier_shifts')
    .insert({
      restaurant_id: restaurantId,
      branch_id: branchId,
      cashier_id: cashierId,
      starting_cash: startingCash,
      status: 'open',
    })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as CashierShift, error: null };
}

export interface CloseShiftResult {
  shift_id: string;
  expected_cash: number;
  cash_difference: number;
  cash_sales: number;
  card_sales: number;
  order_count: number;
}

export async function closeShift(
  shiftId: string,
  endingCash: number
): Promise<{ data: CloseShiftResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('close_cashier_shift', {
    p_shift_id: shiftId,
    p_ending_cash: endingCash,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as CloseShiftResult, error: null };
}

// ─── Update payment status

export interface ShiftStats {
  orderCount: number;
  totalSales: number;
  cashSales: number;
  cardSales: number;
}

export async function fetchShiftStats(
  restaurantId: string,
  branchId: string,
  cashierId: string,
  openedAt: string
): Promise<{ data: ShiftStats | null; error: string | null }> {
  const { data, error } = await supabase
    .from('orders')
    .select('total, payment_method, payment_status, status')
    .eq('restaurant_id', restaurantId)
    .eq('branch_id', branchId)
    .eq('cashier_id', cashierId)
    .gte('created_at', openedAt)
    .eq('payment_status', 'paid')
    .neq('status', 'cancelled');
  if (error) return { data: null, error: error.message };

  const paidOrders = (data ?? []).filter((o) => o.payment_status === 'paid' && o.status !== 'cancelled');

  return {
    data: {
      orderCount: paidOrders.length,
      totalSales: paidOrders.reduce((sum, o) => sum + Number(o.total), 0),
      cashSales: paidOrders.filter((o) => o.payment_method === 'cash').reduce((sum, o) => sum + Number(o.total), 0),
      cardSales: paidOrders.filter((o) => o.payment_method === 'card').reduce((sum, o) => sum + Number(o.total), 0),
    },
    error: null,
  };
}


