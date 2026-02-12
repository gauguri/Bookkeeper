import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Boxes,
  ClipboardList,
  FileText,
  Layers,
  LayoutGrid,
  Moon,
  PackageCheck,
  Sun,
  Truck,
  Users
} from "lucide-react";
import ChartOfAccountsBulkImportPage from "./pages/ChartOfAccountsBulkImportPage";
import ChartOfAccountsPage from "./pages/ChartOfAccountsPage";
import CustomersPage from "./pages/CustomersPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import InvoicesPage from "./pages/InvoicesPage";
import InventoryPage from "./pages/InventoryPage";
import ItemsPage from "./pages/ItemsPage";
import PaymentsPage from "./pages/PaymentsPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import ReportsPage from "./pages/ReportsPage";
import SalesLanding from "./pages/SalesLanding";
import SalesRequestDetailPage from "./pages/SalesRequestDetailPage";
import SalesRequestsPage from "./pages/SalesRequestsPage";
import SuppliersPage from "./pages/SuppliersPage";

const navSections = [
  {
    title: "Sales",
    items: [
      { label: "Overview", to: "/sales", icon: LayoutGrid },
      { label: "Customers", to: "/sales/customers", icon: Users },
      { label: "Items", to: "/sales/items", icon: ClipboardList },
      { label: "Sales Requests", to: "/sales-requests", icon: ClipboardList },
      { label: "Invoices", to: "/sales/invoices", icon: FileText },
      { label: "Payments", to: "/sales/payments", icon: Banknote },
      { label: "Reports", to: "/sales/reports", icon: Layers }
    ]
  },
  {
    title: "Accounting",
    items: [
      { label: "Expenses", to: "/expenses", icon: FileText },
      { label: "Banking", to: "/banking", icon: Banknote },
      {
        label: "Chart of Accounts",
        to: "/accounts",
        icon: Layers,
        children: [{ label: "Bulk Import", to: "/accounts/bulk-import", icon: ClipboardList }]
      }
    ]
  },
  {
    title: "Purchasing",
    items: [
      { label: "Suppliers", to: "/purchasing/suppliers", icon: Truck },
      { label: "Purchase Orders", to: "/purchasing/purchase-orders", icon: PackageCheck }
    ]
  },
  {
    title: "Inventory",
    items: [{ label: "Inventory", to: "/inventory", icon: Boxes }]
  }
];

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() =>
    window.localStorage.getItem("bookkeeper-theme") === "dark"
  );

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add("dark");
      window.localStorage.setItem("bookkeeper-theme", "dark");
    } else {
      root.classList.remove("dark");
      window.localStorage.setItem("bookkeeper-theme", "light");
    }
  }, [darkMode]);

  const navWidth = collapsed ? "w-20" : "w-72";
  const navLabelClass = collapsed ? "opacity-0 translate-x-4" : "opacity-100";

  const badgeClasses = useMemo(
    () =>
      "app-badge border-primary/30 bg-primary/10 text-primary",
    []
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden md:flex ${navWidth} flex-col border-r bg-surface/95 px-4 pb-6 pt-6 shadow-soft backdrop-blur transition-all`}
      >
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
              BK
            </div>
            <div className={`transition ${navLabelClass}`}>
              <p className="text-sm font-semibold text-muted">Bookkeeper</p>
              <p className="text-lg font-semibold">Pulse Finance</p>
            </div>
          </div>
          <button
            className="app-button-ghost h-9 w-9 rounded-full"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label="Toggle sidebar"
          >
            <span className="text-lg">{collapsed ? ">" : "<"}</span>
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-6 overflow-hidden">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-3">
              <p
                className={`px-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted transition ${navLabelClass}`}
              >
                {section.title}
              </p>
              <nav className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <div key={item.to} className="space-y-1">
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow-glow"
                            : "text-muted hover:bg-secondary hover:text-foreground"
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span className={`transition ${navLabelClass}`}>{item.label}</span>
                    </NavLink>
                    {item.children?.length ? (
                      <div className={`ml-6 space-y-1 border-l border-border/60 pl-3 transition ${navLabelClass}`}>
                        {item.children.map((child) => (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            className={({ isActive }) =>
                              `group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                                isActive
                                  ? "bg-primary/15 text-primary"
                                  : "text-muted hover:bg-secondary hover:text-foreground"
                              }`
                            }
                          >
                            <child.icon className="h-3.5 w-3.5" />
                            <span>{child.label}</span>
                          </NavLink>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="mt-auto pt-6">
          <div className="app-card-muted p-4">
            <p className={`text-xs font-semibold text-muted transition ${navLabelClass}`}>Workspace</p>
            <div className="mt-2 flex items-center justify-between">
              <div className={`transition ${navLabelClass}`}>
                <p className="text-sm font-semibold">Mercury Studio</p>
                <p className="text-xs text-muted">FY2024 Q4</p>
              </div>
              <span className={badgeClasses}>DEV</span>
            </div>
          </div>
        </div>
      </aside>

      <header
        className={`sticky top-0 z-30 flex items-center justify-between border-b bg-surface/80 px-6 py-4 shadow-soft backdrop-blur ${
          collapsed ? "md:ml-20" : "md:ml-72"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="md:hidden">
            <button
              className="app-button-ghost h-10 w-10 rounded-full"
              onClick={() => setCollapsed((prev) => !prev)}
            >
              ☰
            </button>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Bookkeeper</p>
            <h1 className="text-lg font-semibold">Sales Command Center</h1>
          </div>
          <span className={badgeClasses}>DEV</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="app-button-ghost" onClick={() => setDarkMode((prev) => !prev)}>
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="hidden sm:inline">{darkMode ? "Light" : "Dark"}</span>
          </button>
          <div className="flex items-center gap-3 rounded-full border bg-surface px-3 py-1.5 shadow-soft">
            <span className="text-sm font-medium">Ava Brooks</span>
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-600" />
          </div>
        </div>
      </header>

      <main className={`relative px-6 pb-16 pt-8 md:ml-72 ${collapsed ? "md:ml-20" : ""}`}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-8"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<SalesLanding />} />
        <Route path="/sales" element={<SalesLanding />} />
        <Route path="/sales/customers" element={<CustomersPage />} />
        <Route path="/sales/items" element={<ItemsPage />} />
        <Route path="/sales-requests" element={<SalesRequestsPage />} />
        <Route path="/sales-requests/:id" element={<SalesRequestDetailPage />} />
        <Route path="/sales/requests" element={<SalesRequestsPage />} />
        <Route path="/sales/invoices" element={<InvoicesPage />} />
        <Route path="/sales/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/sales/payments" element={<PaymentsPage />} />
        <Route path="/sales/reports" element={<ReportsPage />} />
        <Route path="/expenses" element={<PlaceholderPage title="Expenses" />} />
        <Route path="/banking" element={<PlaceholderPage title="Banking" />} />
        <Route path="/accounts" element={<ChartOfAccountsPage />} />
        <Route path="/accounts/bulk-import" element={<ChartOfAccountsBulkImportPage />} />
        <Route path="/purchasing/suppliers" element={<SuppliersPage />} />
        <Route path="/purchasing/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
      </Routes>
    </Layout>
  );
}
