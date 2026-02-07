import { NavLink, Route, Routes } from "react-router-dom";
import CustomersPage from "./pages/CustomersPage";
import InvoiceDetailPage from "./pages/InvoiceDetailPage";
import InvoicesPage from "./pages/InvoicesPage";
import ItemsPage from "./pages/ItemsPage";
import PaymentsPage from "./pages/PaymentsPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import ReportsPage from "./pages/ReportsPage";
import SalesLanding from "./pages/SalesLanding";

const navItems = [
  { label: "Sales", to: "/sales" },
  { label: "Customers", to: "/sales/customers" },
  { label: "Items", to: "/sales/items" },
  { label: "Invoices", to: "/sales/invoices" },
  { label: "Payments", to: "/sales/payments" },
  { label: "Reports", to: "/sales/reports" },
  { label: "Expenses", to: "/expenses" },
  { label: "Banking", to: "/banking" },
  { label: "Chart of Accounts", to: "/accounts" },
  { label: "Import", to: "/import" }
];

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white border-r border-slate-200 p-6">
        <div className="text-xl font-semibold mb-6">Bookkeeper</div>
        <nav className="flex flex-col gap-2 text-sm">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded px-3 py-2 ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <div className="max-w-5xl mx-auto space-y-6">{children}</div>
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
        <Route path="/sales/invoices" element={<InvoicesPage />} />
        <Route path="/sales/invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="/sales/payments" element={<PaymentsPage />} />
        <Route path="/sales/reports" element={<ReportsPage />} />
        <Route path="/expenses" element={<PlaceholderPage title="Expenses" />} />
        <Route path="/banking" element={<PlaceholderPage title="Banking" />} />
        <Route path="/accounts" element={<PlaceholderPage title="Chart of Accounts" />} />
        <Route path="/import" element={<PlaceholderPage title="Import" />} />
      </Routes>
    </Layout>
  );
}
