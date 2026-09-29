import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { BranchFilterProvider } from '@/hooks/useBranchFilter';
import { CartProvider } from '@/hooks/useCart';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import SetupAdminPassword from '@/pages/SetupAdminPassword';
import Onboarding from '@/pages/Onboarding';
import { RequireAuth } from '@/layouts/AppShell';
import { OwnerLayout, RequireOwner } from '@/layouts/OwnerLayout';
import { ManagerLayout, RequireManager } from '@/layouts/ManagerLayout';
import { KitchenLayout, RequireKitchen } from '@/layouts/KitchenLayout';
import { CashierLayout, RequireCashier } from '@/layouts/CashierLayout';
import { CustomerLayout, RequireCustomer } from '@/layouts/CustomerLayout';
import { AdminLayout, RequireSuperAdmin } from '@/layouts/AdminLayout';
import AdminDashboard from '@/pages/AdminDashboard';

// Owner pages
import OwnerOverview from '@/pages/owner/Overview';
import OwnerOrders from '@/pages/owner/Orders';
import OwnerMenu from '@/pages/owner/Menu';
import OwnerCustomers from '@/pages/owner/Customers';
import OwnerInventory from '@/pages/owner/Inventory';
import OwnerEmployees from '@/pages/owner/Employees';
import OwnerReports from '@/pages/owner/Reports';

// Manager pages
import ManagerOverview from '@/pages/manager/Overview';
import ManagerOrders from '@/pages/manager/Orders';
import ManagerInventory from '@/pages/manager/Inventory';
import ManagerCustomers from '@/pages/manager/Customers';
import ManagerMenu from '@/pages/manager/Menu';
import ManagerEmployees from '@/pages/manager/Employees';
import ManagerReports from '@/pages/manager/Reports';

// Kitchen pages
import KitchenOverview from '@/pages/kitchen/Overview';
import KitchenOrders from '@/pages/kitchen/Orders';
import KitchenMenu from '@/pages/kitchen/Menu';
import KitchenCategories from '@/pages/kitchen/Categories';

// Cashier pages
import CashierPOS from '@/pages/cashier/POS';
import CashierOrders from '@/pages/cashier/Orders';
import CashierShift from '@/pages/cashier/Shift';
import CashierCustomers from '@/pages/cashier/Customers';

// Customer pages
import CustomerHome from '@/pages/customer/Home';
import CustomerBranches from '@/pages/customer/Branches';
import CustomerMenu from '@/pages/customer/Menu';
import CustomerCart from '@/pages/customer/Cart';
import CustomerCheckout from '@/pages/customer/Checkout';
import CustomerOrders from '@/pages/customer/Orders';
import CustomerOrderDetails from '@/pages/customer/OrderDetails';
import CustomerProfile from '@/pages/customer/Profile';

function OwnerRoutes() {
  const { branches, loading } = useBranches();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BranchFilterProvider initialBranches={branches}>
      <OwnerLayout />
    </BranchFilterProvider>
  );
}

/**
 * Determines which layout + page set to render based on the user's identity.
 * - Staff (restaurant_members) → staff dashboard with staff layout
 * - Customer (customers table) → customer dashboard with customer layout
 * - Neither → redirect to onboarding
 */
function DashboardRouter() {
const { isSuperAdmin, user, membership, customer, loading } = useAuth();
const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

const isDesignatedSuperAdmin =
  (user?.email ?? '').trim().toLowerCase() === 'ahmedsamysaid00@gmail.com';

if (
  (isSuperAdmin || isDesignatedSuperAdmin) &&
  location.pathname === '/'
) {
  return <Navigate to="/admin" replace />;
}

  // No identity → onboarding
  if (!membership && !customer) return <Navigate to="/onboarding" replace />;

  // Customer path — membership is null but customer exists
  if (!membership) {
    return (
      <RequireCustomer>
        <CartProvider>
          <CustomerLayout />
        </CartProvider>
      </RequireCustomer>
    );
  }

  // Staff paths — membership is non-null here
  if (membership.role === 'owner') {
    return (
      <RequireOwner>
        <OwnerRoutes />
      </RequireOwner>
    );
  }

  if (membership.role === 'manager') {
    return (
      <RequireManager>
        <ManagerLayout />
      </RequireManager>
    );
  }

  if (membership.role === 'kitchen') {
    return (
      <RequireKitchen>
        <KitchenLayout />
      </RequireKitchen>
    );
  }

  if (membership.role === 'cashier') {
    return (
      <RequireCashier>
        <CashierLayout />
      </RequireCashier>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-stone-900">Dashboard coming soon</h1>
        <p className="text-stone-500 mt-2">
          Your role ({membership.role}) dashboard is not available yet.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/setup-admin-password" element={<SetupAdminPassword />} />
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequireSuperAdmin>
                  <AdminLayout />
                </RequireSuperAdmin>
              </RequireAuth>
            }
          >
            <Route index element={<AdminDashboard />} />
          </Route>
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardRouter />
              </RequireAuth>
            }
          >
            {/* These child routes render inside the layout's <Outlet/>.
                For customers: CustomerLayout renders these customer pages.
                For staff: staff layouts render these role-based pages. */}
            <Route index element={<RouteIndex />} />
            <Route path="restaurants/:restaurantId" element={<RouteBranches />} />
            <Route path="restaurants/:restaurantId/branches/:branchId" element={<RouteMenu />} />
            <Route path="cart" element={<RouteCart />} />
            <Route path="checkout" element={<RouteCheckout />} />
            <Route path="orders" element={<RouteOrders />} />
            <Route path="orders/:id" element={<RouteOrderDetails />} />
            <Route path="profile" element={<RouteProfile />} />
            <Route path="customers" element={<RouteCustomers />} />
            <Route path="inventory" element={<RouteInventory />} />
            <Route path="employees" element={<RouteEmployees />} />
            <Route path="reports" element={<RouteReports />} />
            <Route path="categories" element={<RouteCategories />} />
            <Route path="shift" element={<RouteShift />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

// ─── Role-aware route components ───────────────────────────────────────────
// Each checks whether the user is a customer or staff and renders accordingly.

function RouteIndex() {
  const { membership } = useAuth();
  if (!membership) return <CustomerHome />;
  if (membership.role === 'manager') return <ManagerOverview />;
  if (membership.role === 'kitchen') return <KitchenOverview />;
  if (membership.role === 'cashier') return <CashierPOS />;
  return <OwnerOverview />;
}

function RouteBranches() {
  const { membership } = useAuth();
  const { restaurantId } = useParams();
  if (!membership) return <CustomerBranches restaurantId={restaurantId!} />;
  return <Navigate to="/" replace />;
}

function RouteMenu() {
  const { membership } = useAuth();
  if (!membership) return <CustomerMenu />;
  if (membership.role === 'manager') return <ManagerMenu />;
  if (membership.role === 'kitchen') return <KitchenMenu />;
  return <OwnerMenu />;
}

function RouteCart() {
  const { membership } = useAuth();
  if (!membership) return <CustomerCart />;
  return <Navigate to="/" replace />;
}

function RouteCheckout() {
  const { membership } = useAuth();
  if (!membership) return <CustomerCheckout />;
  return <Navigate to="/" replace />;
}

function RouteOrders() {
  const { membership } = useAuth();
  if (!membership) return <CustomerOrders />;
  if (membership.role === 'manager') return <ManagerOrders />;
  if (membership.role === 'kitchen') return <KitchenOrders />;
  if (membership.role === 'cashier') return <CashierOrders />;
  return <OwnerOrders />;
}

function RouteOrderDetails() {
  const { membership } = useAuth();
  if (!membership) return <CustomerOrderDetails />;
  return <Navigate to="/orders" replace />;
}

function RouteProfile() {
  const { membership } = useAuth();
  if (!membership) return <CustomerProfile />;
  return <Navigate to="/" replace />;
}

function RouteCustomers() {
  const { membership } = useAuth();
  if (membership?.role === 'manager') return <ManagerCustomers />;
  if (membership?.role === 'cashier') return <CashierCustomers />;
  return <OwnerCustomers />;
}

function RouteInventory() {
  const { membership } = useAuth();
  if (membership?.role === 'manager') return <ManagerInventory />;
  return <OwnerInventory />;
}

function RouteEmployees() {
  const { membership } = useAuth();
  if (membership?.role === 'manager') return <ManagerEmployees />;
  return <OwnerEmployees />;
}

function RouteReports() {
  const { membership } = useAuth();
  if (membership?.role === 'manager') return <ManagerReports />;
  return <OwnerReports />;
}

function RouteCategories() {
  const { membership } = useAuth();
  if (membership?.role === 'kitchen') return <KitchenCategories />;
  return <Navigate to="/" replace />;
}

function RouteShift() {
  const { membership } = useAuth();
  if (membership?.role === 'cashier') return <CashierShift />;
  return <Navigate to="/" replace />;
}
