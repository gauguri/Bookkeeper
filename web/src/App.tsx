import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Boxes, ClipboardList, FileText, Layers, LayoutGrid, Moon, PackageCheck, Settings, Sun, Truck, Users } from "lucide-react";
import { useAuth } from "./auth";
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
import PlaceholderPage from "./pages/PlaceholderPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import ReportsPage from "./pages/ReportsPage";
import SalesLanding from "./pages/SalesLanding";
import SalesRequestDetailPage from "./pages/SalesRequestDetailPage";
import SalesRequestEditPage from "./pages/SalesRequestEditPage";
import SalesRequestsPage from "./pages/SalesRequestsPage";
import SuppliersPage from "./pages/SuppliersPage";

type NavItem = { label: string; to: string; icon: any; moduleKey?: string; children?: NavItem[] };
const navSections: { title: string; items: NavItem[] }[] = [
  { title: "Sales", items: [
    { label: "Overview", to: "/sales", icon: LayoutGrid, moduleKey: "DASHBOARD" },
    { label: "Customers", to: "/sales/customers", icon: Users, moduleKey: "CUSTOMERS" },
    { label: "Items", to: "/sales/items", icon: ClipboardList, moduleKey: "ITEMS" },
    { label: "Sales Requests", to: "/sales-requests", icon: ClipboardList, moduleKey: "SALES_REQUESTS" },
    { label: "Invoices", to: "/sales/invoices", icon: FileText, moduleKey: "INVOICES" },
    { label: "Payments", to: "/sales/payments", icon: Banknote, moduleKey: "PAYMENTS" },
    { label: "Reports", to: "/sales/reports", icon: Layers, moduleKey: "REPORTS" }
  ]},
  { title: "Accounting", items: [
    { label: "Expenses", to: "/expenses", icon: FileText, moduleKey: "EXPENSES" },
    { label: "Banking", to: "/banking", icon: Banknote, moduleKey: "BANKING" },
    { label: "Chart of Accounts", to: "/accounts", icon: Layers, moduleKey: "CHART_OF_ACCOUNTS", children: [{ label: "Bulk Import", to: "/accounts/bulk-import", icon: ClipboardList, moduleKey: "IMPORT" }] }
  ]},
  { title: "Purchasing", items: [
    { label: "Suppliers", to: "/purchasing/suppliers", icon: Truck, moduleKey: "SUPPLIERS" },
    { label: "Purchase Orders", to: "/purchasing/purchase-orders", icon: PackageCheck, moduleKey: "PURCHASE_ORDERS" }
  ]},
  { title: "Inventory", items: [{ label: "Inventory", to: "/inventory", icon: Boxes, moduleKey: "INVENTORY" }]},
  { title: "Admin", items: [{ label: "Control", to: "/control", icon: Settings, moduleKey: "CONTROL" }]}
];

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { allowedModules, isAdmin, user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => window.localStorage.getItem("bookkeeper-theme") === "dark");
  const hasModule = (key?: string) => !key || isAdmin || allowedModules.includes(key);
  const filteredSections = navSections.map((section) => ({ ...section, items: section.items.filter((item) => hasModule(item.moduleKey)) })).filter((s) => s.items.length > 0);

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
      <div className="mt-6 flex flex-col gap-6 overflow-hidden">{filteredSections.map((section) => <div key={section.title} className="space-y-3"><p className={`px-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted transition ${navLabelClass}`}>{section.title}</p><nav className="flex flex-col gap-1">{section.items.map((item) => <div key={item.to}><NavLink to={item.to} className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? "bg-primary text-primary-foreground shadow-glow" : "text-muted hover:bg-secondary hover:text-foreground"}`}><item.icon className="h-4 w-4" /><span className={`transition ${navLabelClass}`}>{item.label}</span></NavLink></div>)}</nav></div>)}</div>
    </aside>
    <header className={`sticky top-0 z-30 flex items-center justify-between border-b bg-surface/80 px-6 py-4 shadow-soft backdrop-blur ${collapsed ? "md:ml-20" : "md:ml-72"}`}><div><p className="text-xs uppercase tracking-[0.3em] text-muted">Bookkeeper</p><h1 className="text-lg font-semibold">Sales Command Center</h1></div><div className="flex items-center gap-3"><button className="app-button-ghost" onClick={() => setDarkMode((p) => !p)}>{darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button><span>{user?.full_name || user?.email}</span><button className="app-button-ghost" onClick={logout}>Logout</button><span className={badgeClasses}>DEV</span></div></header>
    <main className={`relative px-6 pb-16 pt-8 ${collapsed ? "md:ml-20" : "md:ml-72"}`}><div className="mx-auto flex w-full max-w-6xl flex-col gap-8"><AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="space-y-8">{children}</motion.div></AnimatePresence></div></main>
  </div>;
}

function ProtectedRoute({ moduleKey, children }: { moduleKey?: string; children: JSX.Element }) {
  const { token, loading, isAdmin, allowedModules } = useAuth();
  if (loading) return <div className="p-8">Loading...</div>;
  if (!token) return <Navigate to="/login" replace />;
  if (moduleKey && !isAdmin && !allowedModules.includes(moduleKey)) return <PlaceholderPage title="Not authorized" />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Layout><Routes>
        <Route path="/" element={<ProtectedRoute moduleKey="DASHBOARD"><SalesLanding /></ProtectedRoute>} />
        <Route path="/sales" element={<ProtectedRoute moduleKey="DASHBOARD"><SalesLanding /></ProtectedRoute>} />
        <Route path="/sales/customers" element={<ProtectedRoute moduleKey="CUSTOMERS"><CustomersPage /></ProtectedRoute>} />
        <Route path="/sales/items" element={<ProtectedRoute moduleKey="ITEMS"><ItemsPage /></ProtectedRoute>} />
        <Route path="/sales-requests" element={<ProtectedRoute moduleKey="SALES_REQUESTS"><SalesRequestsPage /></ProtectedRoute>} />
        <Route path="/sales-requests/:id" element={<ProtectedRoute moduleKey="SALES_REQUESTS"><SalesRequestDetailPage /></ProtectedRoute>} />
        <Route path="/sales-requests/:id/edit" element={<ProtectedRoute moduleKey="SALES_REQUESTS"><SalesRequestEditPage /></ProtectedRoute>} />
        <Route path="/sales/invoices" element={<ProtectedRoute moduleKey="INVOICES"><InvoicesPage /></ProtectedRoute>} />
        <Route path="/sales/invoices/:invoiceId" element={<ProtectedRoute moduleKey="INVOICES"><InvoiceDetailPage /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute moduleKey="INVOICES"><InvoicesPage /></ProtectedRoute>} />
        <Route path="/invoices/:invoiceId" element={<ProtectedRoute moduleKey="INVOICES"><InvoiceDetailPage /></ProtectedRoute>} />
        <Route path="/sales/payments" element={<ProtectedRoute moduleKey="PAYMENTS"><PaymentsPage /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute moduleKey="PAYMENTS"><PaymentsPage /></ProtectedRoute>} />
        <Route path="/sales/reports" element={<ProtectedRoute moduleKey="REPORTS"><ReportsPage /></ProtectedRoute>} />
        <Route path="/expenses" element={<ProtectedRoute moduleKey="EXPENSES"><ExpensesPage /></ProtectedRoute>} />
        <Route path="/banking" element={<ProtectedRoute moduleKey="BANKING"><PlaceholderPage title="Banking" /></ProtectedRoute>} />
        <Route path="/accounts" element={<ProtectedRoute moduleKey="CHART_OF_ACCOUNTS"><ChartOfAccountsPage /></ProtectedRoute>} />
        <Route path="/accounts/bulk-import" element={<ProtectedRoute moduleKey="IMPORT"><ChartOfAccountsBulkImportPage /></ProtectedRoute>} />
        <Route path="/purchasing/suppliers" element={<ProtectedRoute moduleKey="SUPPLIERS"><SuppliersPage /></ProtectedRoute>} />
        <Route path="/purchasing/purchase-orders" element={<ProtectedRoute moduleKey="PURCHASE_ORDERS"><PurchaseOrdersPage /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute moduleKey="INVENTORY"><InventoryPage /></ProtectedRoute>} />
        <Route path="/control" element={<ProtectedRoute moduleKey="CONTROL"><ControlPage /></ProtectedRoute>} />
      </Routes></Layout>} />
    </Routes>
  );
}
