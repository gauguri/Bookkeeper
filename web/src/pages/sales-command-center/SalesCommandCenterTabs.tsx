import { NavLink } from "react-router-dom";

const tabs = [
  { label: "Dashboard", to: "/sales/command-center" },
  { label: "Accounts", to: "/sales/command-center/accounts" },
  { label: "Opportunities", to: "/sales/command-center/opportunities" },
  { label: "Quotes", to: "/sales/command-center/quotes" },
  { label: "Orders", to: "/sales/command-center/orders" },
  { label: "Activities", to: "/sales/command-center/activities" },
  { label: "Reports", to: "/sales/command-center/reports" },
];

export default function SalesCommandCenterTabs() {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Sales command center sections">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === "/sales/command-center"}
          className={({ isActive }) => `rounded-full px-4 py-2 text-sm font-semibold transition ${isActive ? "bg-primary text-primary-foreground shadow-glow" : "border bg-surface text-muted hover:text-foreground"}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
