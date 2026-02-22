import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Mail, Phone, MapPin, FileText, CreditCard, ShoppingCart,
  Activity, Package, Edit3, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { useCustomer360 } from "../hooks/useCustomers";
import { formatCurrency, formatDays, formatPercent } from "../utils/formatters";
import TierBadge from "../components/customers/TierBadge";
import PaymentScoreBadge from "../components/customers/PaymentScoreBadge";
import CustomerKpiRow from "../components/customers/CustomerKpiRow";
import CustomerRevenueChart from "../components/customers/CustomerRevenueChart";
import CustomerAgingBar from "../components/customers/CustomerAgingBar";
import CustomerTimeline from "../components/customers/CustomerTimeline";
import TopItemsTable from "../components/customers/TopItemsTable";

type Tab = "overview" | "invoices" | "payments" | "activity";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "overview",  label: "Overview",  icon: Activity },
  { key: "invoices",  label: "Invoices",  icon: FileText },
  { key: "payments",  label: "Payments",  icon: CreditCard },
  { key: "activity",  label: "Activity",  icon: ShoppingCart },
];

export default function CustomerProfilePage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const id = customerId ? parseInt(customerId, 10) : undefined;
  const { data, isLoading, error } = useCustomer360(id);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showContact, setShowContact] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="app-card h-20 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="app-card h-72 animate-pulse bg-gray-100 dark:bg-gray-800" />
          <div className="app-card h-72 animate-pulse bg-gray-100 dark:bg-gray-800" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-card p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="mt-2 text-sm text-muted">Failed to load customer data.</p>
        <button className="app-button mt-4" onClick={() => navigate("/sales/customers")}>
          Back to Customers
        </button>
      </div>
    );
  }

  const { customer, kpis, aging, revenue_trend, recent_activity, top_items } = data;

  // Extract invoices and payments from activity for tab views
  const invoiceActivities = recent_activity.filter(
    (a) => a.type.startsWith("invoice_") || a.type === "invoice_shipped"
  );
  const paymentActivities = recent_activity.filter((a) => a.type === "payment_received");

  return (
    <div className="space-y-6">
      {/* ── Back button ── */}
      <button
        onClick={() => navigate("/sales/customers")}
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Customers
      </button>

      {/* ── Header Card ── */}
      <div className="app-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: Name & badges */}
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-glow">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{customer.name}</h1>
                <TierBadge tier={customer.tier} size="md" />
                <PaymentScoreBadge score={kpis.payment_score} />
                {!customer.is_active && (
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    Archived
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                Customer since {new Date(customer.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                {" · "}{kpis.total_invoices} invoices · {kpis.total_payments} payments
              </p>
            </div>
          </div>

          {/* Right: Quick actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              to={`/sales/invoices?customer=${customer.id}`}
              className="app-button-secondary flex items-center gap-1.5 text-xs"
            >
              <FileText className="h-3.5 w-3.5" /> View Invoices
            </Link>
            <button
              className="app-button-ghost flex items-center gap-1.5 text-xs"
              onClick={() => setShowContact((p) => !p)}
            >
              <Edit3 className="h-3.5 w-3.5" /> Contact Info
              {showContact ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* Contact info expandable */}
        {showContact && (
          <div className="mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-4">
            {customer.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted" />
                <a href={`mailto:${customer.email}`} className="text-primary hover:underline truncate">
                  {customer.email}
                </a>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted" />
                <span>{customer.phone}</span>
              </div>
            )}
            {customer.billing_address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted flex-shrink-0 mt-0.5" />
                <span className="text-muted">{customer.billing_address}</span>
              </div>
            )}
            {customer.notes && (
              <div className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-1">
                <FileText className="h-4 w-4 text-muted flex-shrink-0 mt-0.5" />
                <span className="text-muted">{customer.notes}</span>
              </div>
            )}
            {!customer.email && !customer.phone && !customer.billing_address && (
              <p className="text-sm text-muted col-span-full">No contact details recorded.</p>
            )}
          </div>
        )}
      </div>

      {/* ── KPI Row ── */}
      <CustomerKpiRow kpis={kpis} />

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CustomerRevenueChart data={revenue_trend} />
            <CustomerAgingBar aging={aging} />
          </div>
          {/* Bottom row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TopItemsTable items={top_items} />
            <div className="app-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Recent Activity</h3>
              <CustomerTimeline activities={recent_activity} maxItems={8} />
            </div>
          </div>
        </div>
      )}

      {activeTab === "invoices" && (
        <div className="app-card overflow-hidden">
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Invoice History</h3>
            <span className="text-xs text-muted">{kpis.total_invoices} total invoices</span>
          </div>
          {invoiceActivities.length > 0 ? (
            <div className="divide-y">
              {invoiceActivities.map((act) => (
                <div key={act.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{act.title}</p>
                      <p className="text-xs text-muted truncate">{act.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {act.amount != null && (
                      <span className="text-sm font-semibold tabular-nums">{formatCurrency(act.amount)}</span>
                    )}
                    <span className="text-xs text-muted">{new Date(act.date).toLocaleDateString()}</span>
                    {act.reference && (
                      <Link
                        to={`/invoices/${act.reference}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted">No invoices found.</div>
          )}
        </div>
      )}

      {activeTab === "payments" && (
        <div className="app-card overflow-hidden">
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Payment History</h3>
            <span className="text-xs text-muted">{kpis.total_payments} total payments</span>
          </div>
          {paymentActivities.length > 0 ? (
            <div className="divide-y">
              {paymentActivities.map((act) => (
                <div key={act.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <CreditCard className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{act.title}</p>
                      <p className="text-xs text-muted truncate">{act.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {act.amount != null && (
                      <span className="text-sm font-semibold text-emerald-600 tabular-nums">
                        +{formatCurrency(act.amount)}
                      </span>
                    )}
                    <span className="text-xs text-muted">{new Date(act.date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted">No payments found.</div>
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="app-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Full Activity Timeline</h3>
          <CustomerTimeline activities={recent_activity} maxItems={50} />
        </div>
      )}
    </div>
  );
}
