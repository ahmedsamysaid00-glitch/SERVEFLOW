export type RestaurantStatus = 'active' | 'inactive' | 'suspended';
export type MemberRole = 'owner' | 'manager' | 'kitchen' | 'cashier';
export type MemberStatus = 'active' | 'invited' | 'suspended';
export type BranchStatus = 'active' | 'inactive';
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | 'partially_paid';
export type PaymentMethod = 'cash' | 'card' | 'online' | 'wallet' | 'other';
export type InventoryTxType = 'purchase' | 'consumption' | 'adjustment' | 'waste' | 'transfer_in' | 'transfer_out';
export type CustomerStatus = 'active' | 'blocked';

export interface Restaurant {
  id: string;
  name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  status: RestaurantStatus;
  created_at: string;
}

export interface Branch {
  id: string;
  restaurant_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  status: BranchStatus;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface RestaurantMember {
  id: string;
  restaurant_id: string;
  branch_id: string | null;
  user_id: string | null;
  role: MemberRole;
  status: MemberStatus;
  invite_email: string | null;
  created_at: string;
}

export interface MenuCategory {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BranchMenuItem {
  id: string;
  branch_id: string;
  menu_item_id: string;
  price: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  restaurant_id: string;
  branch_id: string;
  customer_id: string | null;
  cashier_id: string | null;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface InventoryItem {
  id: string;
  restaurant_id: string;
  branch_id: string;
  name: string;
  unit: string;
  quantity: number;
  minimum_quantity: number;
  cost_per_unit: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryTransaction {
  id: string;
  restaurant_id: string;
  branch_id: string;
  inventory_item_id: string;
  type: InventoryTxType;
  quantity: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}
