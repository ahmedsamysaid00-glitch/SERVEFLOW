import { supabase } from '@/supabase/client';

export type OwnerRequestStatus = 'pending' | 'approved' | 'rejected' | 'deleted';

export interface OwnerSignupRequest {
  id: string;
  email: string;
  status: OwnerRequestStatus;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  reviewed_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  original_restaurant_name: string | null;
}

export async function fetchOwnerRequests(): Promise<{
  data: OwnerSignupRequest[] | null;
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('owner_signup_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { data: null, error: error.message };
  return { data: data as OwnerSignupRequest[], error: null };
}

export async function reviewOwnerRequest(
  requestId: string,
  action: 'approve' | 'reject'
): Promise<{ data: { id: string; status: string } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('review_owner_signup_request', {
    p_request_id: requestId,
    p_action: action,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as { id: string; status: string }, error: null };
}

export async function submitOwnerSignupRequest(
  email: string
): Promise<{ data: { status: string } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('submit_owner_signup_request', {
    p_email: email,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as { status: string }, error: null };
}

// ─── Reset Test Data ───────────────────────────────────────────────────────

export interface ResetTestRestaurant {
  id: string;
  name: string;
  status: string;
}

export interface ResetTestBranch {
  id: string;
  name: string;
  restaurant_id: string;
}

export interface ResetTestMember {
  id: string;
  user_id: string;
  role: string;
  restaurant_id: string;
}

export interface ResetTestCustomer {
  id: string;
  full_name: string | null;
  email: string | null;
  restaurant_id: string | null;
}

export interface ResetTestProfile {
  id: string;
  full_name: string | null;
}

export interface ResetTestAuthUser {
  id: string;
  email: string;
}

export interface ResetTestDataReport {
  mode: 'preview' | 'execute';
  super_admin_email: string;
  super_admin_preserved: boolean;
  restaurants: ResetTestRestaurant[];
  branches: ResetTestBranch[];
  restaurant_members: ResetTestMember[];
  customers: ResetTestCustomer[];
  orders_count: number;
  order_items_count: number;
  inventory_items_count: number;
  inventory_transactions_count: number;
  cashier_shifts_count: number;
  menu_categories_count: number;
  menu_items_count: number;
  branch_menu_items_count: number;
  profiles: ResetTestProfile[];
  auth_users: ResetTestAuthUser[];
  verification?: {
    restaurants_remaining: number;
    branches_remaining: number;
    restaurant_members_remaining: number;
    orders_remaining: number;
    order_items_remaining: number;
    customers_remaining: number;
    inventory_items_remaining: number;
    inventory_transactions_remaining: number;
    cashier_shifts_remaining: number;
    menu_items_remaining: number;
    menu_categories_remaining: number;
    super_admin_exists: number;
    test_auth_users_remaining: number;
  };
}

export async function resetTestData(
  dryRun: boolean
): Promise<{ data: ResetTestDataReport | null; error: string | null }> {
  const { data, error } = await supabase.rpc('reset_test_data', {
    p_dry_run: dryRun,
  });
  if (error) return { data: null, error: error.message };
  if (!data || typeof data !== 'object') return { data: null, error: 'Unexpected empty response from server' };

  const raw = data as Record<string, unknown>;
  const report: ResetTestDataReport = {
    mode: (raw.mode as 'preview' | 'execute') ?? (dryRun ? 'preview' : 'execute'),
    super_admin_email: (raw.super_admin_email as string) ?? 'ahmedsamysaid00@gmail.com',
    super_admin_preserved: (raw.super_admin_preserved as boolean) ?? true,
    restaurants: Array.isArray(raw.restaurants) ? (raw.restaurants as ResetTestRestaurant[]) : [],
    branches: Array.isArray(raw.branches) ? (raw.branches as ResetTestBranch[]) : [],
    restaurant_members: Array.isArray(raw.restaurant_members) ? (raw.restaurant_members as ResetTestMember[]) : [],
    customers: Array.isArray(raw.customers) ? (raw.customers as ResetTestCustomer[]) : [],
    orders_count: (raw.orders_count as number) ?? 0,
    order_items_count: (raw.order_items_count as number) ?? 0,
    inventory_items_count: (raw.inventory_items_count as number) ?? 0,
    inventory_transactions_count: (raw.inventory_transactions_count as number) ?? 0,
    cashier_shifts_count: (raw.cashier_shifts_count as number) ?? 0,
    menu_categories_count: (raw.menu_categories_count as number) ?? 0,
    menu_items_count: (raw.menu_items_count as number) ?? 0,
    branch_menu_items_count: (raw.branch_menu_items_count as number) ?? 0,
    profiles: Array.isArray(raw.profiles) ? (raw.profiles as ResetTestProfile[]) : [],
    auth_users: Array.isArray(raw.auth_users) ? (raw.auth_users as ResetTestAuthUser[]) : [],
    verification: raw.verification as ResetTestDataReport['verification'],
  };

  return { data: report, error: null };
}


