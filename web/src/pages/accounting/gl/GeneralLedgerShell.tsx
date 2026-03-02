import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

const GL_TABS = [
  { label: "Dashboard", to: "/accounting/gl", end: true },
  { label: "Journals", to: "/accounting/gl/journals" },
  { label: "Trial Balance", to: "/accounting/gl/trial-balance" },
  { label: "Close", to: "/accounting/gl/close" },
  { label: "Reports", to: "/accounting/gl/reports" },
];

export default function GeneralLedgerShell() {
  const location = useLocation();
  const querySuffix = location.search || "";

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Accounting</p>
          <h1 className="text-2xl font-bold">General Ledger Command Center</h1>
          <p className="text-sm text-muted">SAP-grade cockpit for journals, close health, and financial movement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="app-button" to={`/accounting/gl?createJournal=1${querySuffix ? `&${querySuffix.slice(1)}` : ""}`}>
            + New Journal Entry
          </Link>
          <Link className="app-button-secondary" to={`/accounting/gl/trial-balance${querySuffix}`}>
            Trial Balance
          </Link>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="General ledger sections">
        {GL_TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={`${tab.to}${querySuffix}`}
            end={tab.end}
            className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-semibold transition ${isActive ? "bg-primary text-primary-foreground shadow-glow" : "border bg-surface text-muted hover:text-foreground"}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </section>
  );
}
