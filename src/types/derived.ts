import type {
  Branch,
  Customer,
  InventoryItem,
  MenuCategory,
  MenuItem,
  BranchMenuItem,
  Order,
  OrderItem,
  Profile,
  RestaurantMember,
} from './index';

export interface BranchWithStats extends Branch {
  order_count?: number;
  revenue?: number;
}

export interface OrderWithRelations extends Order {
  branches?: Pick<Branch, 'name'>;
  customers?: Pick<Customer, 'full_name' | 'phone'> | null;
}

export interface OrderItemWithMenu extends OrderItem {
  menu_items?: Pick<MenuItem, 'name' | 'image_url'>;
}

export interface MenuItemWithCategory extends MenuItem {
  menu_categories?: Pick<MenuCategory, 'name'>;
}

export interface BranchMenuItemWithRelations extends BranchMenuItem {
  branches?: Pick<Branch, 'name'>;
  menu_items?: MenuItemWithCategory;
}

export interface CustomerWithStats extends Customer {
  order_count?: number;
  total_spent?: number;
  last_order_date?: string | null;
}

export interface EmployeeWithProfile extends RestaurantMember {
  profiles?: Pick<Profile, 'full_name' | 'phone' | 'avatar_url'>;
  branches?: Pick<Branch, 'name'> | null;
}

export interface BestSellerItem {
  menu_item_id: string;
  name: string;
  image_url: string | null;
  total_quantity: number;
  total_revenue: number;
  order_count: number;
}

export interface OverviewStats {
  totalOrders: number;
  totalRevenue: number;
  completedOrders: number;
  activeOrders: number;
  totalCustomers: number;
  branchCount: number;
}

export interface SalesStats {
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
}

export type DateRange = 'today' | '7d' | '30d';

export interface BranchFilter {
  id: string | null;
  name: string;
}
