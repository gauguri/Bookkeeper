import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Boxes, ClipboardList, FileText, Layers, LayoutGrid, Moon, PackageCheck, Settings, Sun, Truck, Users } from "lucide-react";
import { useAuth } from "./auth";
import { getDefaultRoute, getModuleForPath, isPathAllowed, MODULE_ROUTE_MAP } from "./auth-routing";
import { canAccess } from "./authz";
import { MODULES, ModuleKey } from "./constants/modules";
import { apiFetch } from "./api";
import ChartOfAccountsBulkImportPage from "./pages/ChartOfAccountsBulkImportPage";
import ChartOfAccountsPage from "./pages/ChartOfAccountsPage";
import ControlPage from "./pages/ControlPage";
import CustomersPage from "./pages/CustomersPage";
import ExpensesPage from "./pages/ExpensesPage";
import InventoryPage from "./pages/InventoryPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import InvoicesPage from "./pages/InvoicesPage";
import ItemsPage from "./pages/ItemsPage";
import LoginPage from "./pages/LoginPage";
import PaymentsPage from "./pages/PaymentsPage";
import NoAccessPage from "./pages/NoAccessPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import ReportsPage from "./pages/ReportsPage";
import SalesLanding from "./pages/SalesLanding";
import SalesRequestDetailPage from "./pages/SalesRequestDetailPage";
import SalesRequestEditPage from "./pages/SalesRequestEditPage";
import SalesRequestsPage from "./pages/SalesRequestsPage";
import SetupWizardPage from "./pages/SetupWizardPage";
import SuppliersPage from "./pages/SuppliersPage";

type BootstrapStatus = { needs_bootstrap: boolean };
type NavItem = { label: string; to: string; icon: any; moduleKey?: ModuleKey; children?: NavItem[] };
const navSections: { title: string; items: NavItem[] }[] = [
  { title: "Sales", items: [
    { label: "Overview", to: MODULE_ROUTE_MAP[MODULES.DASHBOARD], icon: LayoutGrid, moduleKey: MODULES.DASHBOARD },
    { label: "Customers", to: MODULE_ROUTE_MAP[MODULES.CUSTOMERS], icon: Users, moduleKey: MODULES.CUSTOMERS },
    { label: "Items", to: MODULE_ROUTE_MAP[MODULES.ITEMS], icon: ClipboardList, moduleKey: MODULES.ITEMS },
    { label: "Sales Requests", to: MODULE_ROUTE_MAP[MODULES.SALES_REQUESTS], icon: ClipboardList, moduleKey: MODULES.SALES_REQUESTS },
    { label: "Invoices", to: MODULE_ROUTE_MAP[MODULES.INVOICES], icon: FileText, moduleKey: MODULES.INVOICES },
    { label: "Payments", to: MODULE_ROUTE_MAP[MODULES.PAYMENTS], icon: Banknote, moduleKey: MODULES.PAYMENTS },
    { label: "Reports", to: "/sales/reports", icon: Layers, moduleKey: MODULES.REPORTS }
  ]},
  { title: "Accounting", items: [
    { label: "Expenses", to: "/expenses", icon: FileText, moduleKey: MODULES.EXPENSES },
    { label: "Banking", to: "/banking", icon: Banknote, moduleKey: MODULES.BANKING },
    { label: "Chart of Accounts", to: "/accounts", icon: Layers, moduleKey: MODULES.CHART_OF_ACCOUNTS, children: [{ label: "Bulk Import", to: "/accounts/bulk-import", icon: ClipboardList, moduleKey: MODULES.IMPORT }] }
  ]},
  { title: "Purchasing", items: [
    { label: "Suppliers", to: "/purchasing/suppliers", icon: Truck, moduleKey: MODULES.SUPPLIERS },
    { label: "Purchase Orders", to: "/purchasing/purchase-orders", icon: PackageCheck, moduleKey: MODULES.PURCHASE_ORDERS }
  ]},
  { title: "Inventory", items: [{ label: "Inventory", to: "/inventory", icon: Boxes, moduleKey: MODULES.INVENTORY }]},
  { title: "Admin", items: [{ label: "Control", to: "/control", icon: Settings, moduleKey: MODULES.CONTROL }]}
];

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, loading, allowedModules, isAdmin, user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem("bookkeeper-theme") === "dark");
  const hasModule = (moduleKey?: ModuleKey) => {
    if (!moduleKey) return true;
    return canAccess(moduleKey, { is_admin: isAdmin, allowed_modules: allowedModules });
  };
  const filteredSections = navSections.map((section) => ({ ...section, items: section.items.filter((item) => hasModule(item.moduleKey)) })).filter((s) => s.items.length > 0);
  const defaultRoute = getDefaultRoute({ isAdmin, allowedModules });
  const activeModule = getModuleForPath(location.pathname);

  useEffect(() => {
    if (loading || !token) {
      return;
    }
    if (location.pathname === "/no-access") {
      if (defaultRoute !== "/no-access") {
        navigate(defaultRoute, { replace: true });
      }
      return;
    }
    if (!isPathAllowed(location.pathname, { isAdmin, allowedModules })) {
      navigate(defaultRoute, { replace: true });
    }
  }, [allowedModules, defaultRoute, isAdmin, loading, location.pathname, navigate, token]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", darkMode);
    window.localStorage.setItem("bookkeeper-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const navWidth = collapsed ? "w-20" : "w-72";
  const navLabelClass = collapsed ? "opacity-0 translate-x-4" : "opacity-100";
  const badgeClasses = useMemo(() => "app-badge border-primary/30 bg-primary/10 text-primary", []);

  return <div className="min-h-screen bg-background text-foreground">{/* unchanged layout */}
    <aside className={`fixed inset-y-0 left-0 z-40 hidden md:flex ${navWidth} flex-col border-r bg-surface/95 px-4 pb-6 pt-6 shadow-soft backdrop-blur transition-all`}>
      <div className="flex items-center justify-between px-2"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">BK</div><div className={`transition ${navLabelClass}`}><p className="text-sm font-semibold text-muted">Bookkeeper</p><p className="text-lg font-semibold">Pulse Finance</p></div></div><button className="app-button-ghost h-9 w-9 rounded-full" onClick={() => setCollapsed((p) => !p)}><span className="text-lg">{collapsed ? ">" : "<"}</span></button></div>
      <div className="mt-6 flex flex-col gap-6 overflow-hidden">{filteredSections.map((section) => <div key={section.title} className="space-y-3"><p className={`px-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted transition ${navLabelClass}`}>{section.title}</p><nav className="flex flex-col gap-1">{section.items.map((item) => <div key={item.to}><NavLink to={item.to} className={({ isActive }) => {
        const moduleMatchesCurrentPath = Boolean(item.moduleKey && activeModule && item.moduleKey === activeModule);
        const active = isActive || moduleMatchesCurrentPath;
        return `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-primary text-primary-foreground shadow-glow" : "text-muted hover:bg-secondary hover:text-foreground"}`;
      }}><item.icon className="h-4 w-4" /><span className={`transition ${navLabelClass}`}>{item.label}</span></NavLink></div>)}</nav></div>)}</div>
    </aside>
    <header className={`sticky top-0 z-30 flex items-center justify-between border-b bg-surface/80 px-6 py-4 shadow-soft backdrop-blur ${collapsed ? "md:ml-20" : "md:ml-72"}`}><div><p className="text-xs uppercase tracking-[0.3em] text-muted">Bookkeeper</p><h1 className="text-lg font-semibold">Sales Command Center</h1></div><div className="flex items-center gap-3"><button className="app-button-ghost" onClick={() => setDarkMode((p) => !p)}>{darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button><span>{user?.full_name || user?.email}</span><button className="app-button-ghost" onClick={logout}>Logout</button><span className={badgeClasses}>DEV</span></div></header>
    <main className={`relative px-6 pb-16 pt-8 ${collapsed ? "md:ml-20" : "md:ml-72"}`}><div className="mx-auto flex w-full max-w-6xl flex-col gap-8"><AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="space-y-8">{children}</motion.div></AnimatePresence></div></main>
  </div>;
}

function ProtectedRoute({ moduleKey, children }: { moduleKey?: ModuleKey; children: JSX.Element }) {
  const { token, loading, isAdmin, allowedModules } = useAuth();
  if (loading) return <div className="p-8">Loading...</div>;
  if (!token) return <Navigate to="/login" replace />;
  if (moduleKey && !canAccess(moduleKey, { is_admin: isAdmin, allowed_modules: allowedModules })) return <PlaceholderPage title="Not authorized for this module" />;
  return children;
}

export default function App() {
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  useEffect(() => {
    apiFetch<BootstrapStatus>("/auth/bootstrap/status")
      .then((status) => setNeedsBootstrap(status.needs_bootstrap))
      .catch(() => setNeedsBootstrap(false))
      .finally(() => setBootstrapLoading(false));
  }, []);

  if (bootstrapLoading) {
    return <div className="p-8">Loading setup...</div>;
  }

  return (
    <Routes>
      {needsBootstrap ? (
        <>
          <Route path="/setup" element={<SetupWizardPage />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </>
      ) : (
        <>
          <Route path="/setup" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Layout><Routes>
            <Route path="/" element={<ProtectedRoute moduleKey={MODULES.DASHBOARD}><SalesLanding /></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute moduleKey={MODULES.DASHBOARD}><SalesLanding /></ProtectedRoute>} />
            <Route path="/sales/customers" element={<ProtectedRoute moduleKey={MODULES.CUSTOMERS}><CustomersPage /></ProtectedRoute>} />
            <Route path="/sales/items" element={<ProtectedRoute moduleKey={MODULES.ITEMS}><ItemsPage /></ProtectedRoute>} />
            <Route path="/sales-requests" element={<ProtectedRoute moduleKey={MODULES.SALES_REQUESTS}><SalesRequestsPage /></ProtectedRoute>} />
            <Route path="/sales-requests/:id" element={<ProtectedRoute moduleKey={MODULES.SALES_REQUESTS}><SalesRequestDetailPage /></ProtectedRoute>} />
            <Route path="/sales-requests/:id/edit" element={<ProtectedRoute moduleKey={MODULES.SALES_REQUESTS}><SalesRequestEditPage /></ProtectedRoute>} />
            <Route path="/sales/invoices" element={<ProtectedRoute moduleKey={MODULES.INVOICES}><InvoicesPage /></ProtectedRoute>} />
            <Route path="/sales/invoices/:invoiceId" element={<ProtectedRoute moduleKey={MODULES.INVOICES}><InvoiceDetailPage /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute moduleKey={MODULES.INVOICES}><InvoicesPage /></ProtectedRoute>} />
            <Route path="/invoices/:invoiceId" element={<ProtectedRoute moduleKey={MODULES.INVOICES}><InvoiceDetailPage /></ProtectedRoute>} />
            <Route path="/sales/payments" element={<ProtectedRoute moduleKey={MODULES.PAYMENTS}><PaymentsPage /></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute moduleKey={MODULES.PAYMENTS}><PaymentsPage /></ProtectedRoute>} />
            <Route path="/sales/reports" element={<ProtectedRoute moduleKey={MODULES.REPORTS}><ReportsPage /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute moduleKey={MODULES.EXPENSES}><ExpensesPage /></ProtectedRoute>} />
            <Route path="/banking" element={<ProtectedRoute moduleKey={MODULES.BANKING}><PlaceholderPage title="Banking" /></ProtectedRoute>} />
            <Route path="/accounts" element={<ProtectedRoute moduleKey={MODULES.CHART_OF_ACCOUNTS}><ChartOfAccountsPage /></ProtectedRoute>} />
            <Route path="/accounts/bulk-import" element={<ProtectedRoute moduleKey={MODULES.IMPORT}><ChartOfAccountsBulkImportPage /></ProtectedRoute>} />
            <Route path="/purchasing/suppliers" element={<ProtectedRoute moduleKey={MODULES.SUPPLIERS}><SuppliersPage /></ProtectedRoute>} />
            <Route path="/purchasing/purchase-orders" element={<ProtectedRoute moduleKey={MODULES.PURCHASE_ORDERS}><PurchaseOrdersPage /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute moduleKey={MODULES.INVENTORY}><InventoryPage /></ProtectedRoute>} />
            <Route path="/control" element={<ProtectedRoute moduleKey={MODULES.CONTROL}><ControlPage /></ProtectedRoute>} />
            <Route path="/no-access" element={<ProtectedRoute><NoAccessPage /></ProtectedRoute>} />
          </Routes></Layout>} />
        </>
      )}
    </Routes>
  );
}
