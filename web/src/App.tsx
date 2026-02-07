import { NavLink, Route, Routes } from "react-router-dom";

const navItems = [
  { label: "Dashboard", to: "/" },
  { label: "Sales", to: "/sales" },
  { label: "Expenses", to: "/expenses" },
  { label: "Banking", to: "/banking" },
  { label: "Chart of Accounts", to: "/accounts" },
  { label: "Reports", to: "/reports" },
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

const Placeholder = ({ title, description }: { title: string; description: string }) => (
  <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
    <h1 className="text-2xl font-semibold mb-2">{title}</h1>
    <p className="text-slate-600">{description}</p>
  </div>
);

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            <div className="grid gap-6">
              <Placeholder
                title="Dashboard"
                description="Snapshot of cash, AR/AP, and recent activity."
              />
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-sm text-slate-500">Cash</div>
                  <div className="text-2xl font-semibold">$0.00</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-sm text-slate-500">Accounts Receivable</div>
                  <div className="text-2xl font-semibold">$0.00</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                  <div className="text-sm text-slate-500">Accounts Payable</div>
                  <div className="text-2xl font-semibold">$0.00</div>
                </div>
              </div>
            </div>
          }
        />
        <Route path="/sales" element={<Placeholder title="Sales" description="Invoices and customer payments." />} />
        <Route path="/expenses" element={<Placeholder title="Expenses" description="Bills, vendor payments, and expenses." />} />
        <Route path="/banking" element={<Placeholder title="Banking" description="Deposits and cash activity." />} />
        <Route
          path="/accounts"
          element={<Placeholder title="Chart of Accounts" description="Manage accounts and categories." />}
        />
        <Route path="/reports" element={<Placeholder title="Reports" description="P&L, Balance Sheet, Cash Flow." />} />
        <Route
          path="/import"
          element={<Placeholder title="Import" description="QuickBooks Online and Desktop import wizard." />}
        />
      </Routes>
    </Layout>
  );
}
