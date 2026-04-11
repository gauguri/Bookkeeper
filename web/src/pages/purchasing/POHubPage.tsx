import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  BarChart3,
  Shield,
  AlertTriangle,
  Sparkles,
  Plus,
  Loader2,
  Mail,
  Phone,
  MapPin,
  FileUp,
  X,
} from "lucide-react";
import POKpiCards from "../../components/purchasing/POKpiCards";
import SpendAnalysisChart from "../../components/purchasing/SpendAnalysisChart";
import VendorPerformanceRadar from "../../components/purchasing/VendorPerformanceRadar";
import P2PCycleTime from "../../components/purchasing/P2PCycleTime";
import ComplianceAudit from "../../components/purchasing/ComplianceAudit";
import RiskHeatMap from "../../components/purchasing/RiskHeatMap";
import AIInsightsPanel from "../../components/purchasing/AIInsightsPanel";
import type { ProcurementHubAnalytics } from "../../components/purchasing/types";
import POTable from "../../components/purchasing/POTable";
import { apiFetch } from "../../api";

type Section = "dashboard" | "orders" | "vendors" | "analytics" | "compliance" | "risk" | "ai";

type Supplier = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at?: string;
};

const NAV_ITEMS: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: ShoppingCart },
  { id: "vendors", label: "Vendors", icon: Users },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "compliance", label: "Compliance", icon: Shield },
  { id: "risk", label: "Risk", icon: AlertTriangle },
  { id: "ai", label: "AI Predict", icon: Sparkles },
];

const ANALYTICS_TABS = [
  { id: "spend", label: "Spend Analysis" },
  { id: "vendors", label: "Vendor Performance" },
  { id: "p2p", label: "P2P Cycle Time" },
  { id: "compliance", label: "Compliance" },
  { id: "risk", label: "Risk Heat Map" },
  { id: "ai", label: "AI Insights" },
] as const;

const EMPTY_ANALYTICS: ProcurementHubAnalytics = {
  cards: [],
  spend_trend: [],
  vendor_spend: [],
  cycle_metrics: [],
  compliance_rules: [],
  risk_items: [],
  insights: [],
};

export default function POHubPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("dashboard");
  const [analyticsTab, setAnalyticsTab] = useState<(typeof ANALYTICS_TABS)[number]["id"]>("spend");
  const [hubAnalytics, setHubAnalytics] = useState<ProcurementHubAnalytics>(EMPTY_ANALYTICS);
  const [hubLoading, setHubLoading] = useState(true);
  const [hubError, setHubError] = useState("");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "", address: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const goCreatePO = () => navigate("/purchasing/purchase-orders/new");
  const goImportPOs = () => navigate("/purchasing/purchase-orders/import");

  const loadHubAnalytics = async () => {
    setHubLoading(true);
    setHubError("");
    try {
      setHubAnalytics(await apiFetch<ProcurementHubAnalytics>("/purchase-orders/hub-analytics"));
    } catch (error) {
      setHubAnalytics(EMPTY_ANALYTICS);
      setHubError((error as Error).message || "Failed to load procurement analytics.");
    } finally {
      setHubLoading(false);
    }
  };

  const handleViewPO = (po: { id: number; po_number: string; supplier_name: string }) => {
    navigate(`/purchasing/purchase-orders/${po.id}`, {
      state: {
        supplierName: po.supplier_name,
        backTo: "/purchasing/po-hub",
        backLabel: "Back to Procurement Hub",
      },
    });
  };

  const loadSuppliers = async () => {
    setSuppliersLoading(true);
    try {
      setSuppliers(await apiFetch<Supplier[]>("/suppliers"));
    } catch {
      setSuppliers([]);
    } finally {
      setSuppliersLoading(false);
    }
  };

  useEffect(() => {
    void loadHubAnalytics();
  }, []);

  useEffect(() => {
    if (section === "vendors" && suppliers.length === 0) {
      void loadSuppliers();
    }
  }, [section, suppliers.length]);

  const createSupplier = async () => {
    if (!addForm.name.trim()) {
      setAddError("Supplier name is required.");
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      const created = await apiFetch<Supplier>("/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: addForm.name.trim(),
          email: addForm.email.trim() || null,
          phone: addForm.phone.trim() || null,
          address: addForm.address.trim() || null,
        }),
      });
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setAddSupplierOpen(false);
      setAddForm({ name: "", email: "", phone: "", address: "" });
      void loadHubAnalytics();
    } catch (error) {
      setAddError((error as Error).message || "Failed to create supplier.");
    } finally {
      setAddSaving(false);
    }
  };

  const deleteSupplier = async (id: number) => {
    if (!window.confirm("Delete this supplier?")) {
      return;
    }
    try {
      await apiFetch(`/suppliers/${id}`, { method: "DELETE" });
      setSuppliers((prev) => prev.filter((supplier) => supplier.id !== id));
      void loadHubAnalytics();
    } catch {
      // Ignore delete failures from this view.
    }
  };

  const handleNavClick = (id: Section) => {
    setSection(id);
    if (id === "dashboard") setAnalyticsTab("spend");
    else if (id === "vendors") setAnalyticsTab("vendors");
    else if (id === "compliance") setAnalyticsTab("compliance");
    else if (id === "risk") setAnalyticsTab("risk");
    else if (id === "ai") setAnalyticsTab("ai");
    else if (id === "analytics") setAnalyticsTab("spend");
  };

  const renderAnalyticsContent = () => {
    switch (analyticsTab) {
      case "spend":
        return <SpendAnalysisChart data={hubAnalytics.spend_trend} loading={hubLoading} />;
      case "vendors":
        return <VendorPerformanceRadar vendors={hubAnalytics.vendor_spend} loading={hubLoading} />;
      case "p2p":
        return <P2PCycleTime metrics={hubAnalytics.cycle_metrics} loading={hubLoading} />;
      case "compliance":
        return <ComplianceAudit rules={hubAnalytics.compliance_rules} loading={hubLoading} />;
      case "risk":
        return <RiskHeatMap risks={hubAnalytics.risk_items} loading={hubLoading} />;
      case "ai":
        return <AIInsightsPanel insights={hubAnalytics.insights} loading={hubLoading} />;
      default:
        return <SpendAnalysisChart data={hubAnalytics.spend_trend} loading={hubLoading} />;
    }
  };

  const renderVendors = () => (
    <div className="space-y-6">
      <VendorPerformanceRadar vendors={hubAnalytics.vendor_spend} loading={hubLoading} />

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="text-sm font-semibold">Suppliers</h3>
          <button className="app-button" onClick={() => { setAddSupplierOpen(true); setAddError(""); setAddForm({ name: "", email: "", phone: "", address: "" }); }}>
            <Plus className="h-4 w-4" /> Add Supplier
          </button>
        </div>

        {suppliersLoading ? (
          <div className="p-8 text-center text-sm text-muted">Loading suppliers...</div>
        ) : suppliers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted">No suppliers yet.</p>
            <button className="app-button mt-3" onClick={() => setAddSupplierOpen(true)}>
              <Plus className="h-4 w-4" /> Add Your First Supplier
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Address</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr key={supplier.id} className="app-table-row border-t">
                    <td className="px-4 py-3 font-medium">{supplier.name}</td>
                    <td className="px-4 py-3 text-muted">{supplier.email || "-"}</td>
                    <td className="px-4 py-3 text-muted">{supplier.phone || "-"}</td>
                    <td className="px-4 py-3 text-muted">{supplier.address || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="app-button-ghost text-danger" onClick={() => void deleteSupplier(supplier.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderSection = () => {
    switch (section) {
      case "dashboard":
        return (
          <div className="space-y-6">
            {hubError ? (
              <div className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                {hubError}
              </div>
            ) : null}
            <POKpiCards cards={hubAnalytics.cards} loading={hubLoading} />
            <div className="flex flex-wrap gap-2">
              {ANALYTICS_TABS.map((tab) => (
                <button key={tab.id} className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${analyticsTab === tab.id ? "border-primary/30 bg-primary/10 text-primary" : "hover:bg-secondary"}`} onClick={() => setAnalyticsTab(tab.id)}>
                  {tab.label}
                </button>
              ))}
            </div>
            {renderAnalyticsContent()}
            <POTable onViewPO={handleViewPO} onCreatePO={goCreatePO} />
          </div>
        );
      case "orders":
        return <POTable onViewPO={handleViewPO} onCreatePO={goCreatePO} />;
      case "vendors":
        return renderVendors();
      case "analytics":
        return (
          <div className="space-y-6">
            {hubError ? (
              <div className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                {hubError}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {ANALYTICS_TABS.map((tab) => (
                <button key={tab.id} className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${analyticsTab === tab.id ? "border-primary/30 bg-primary/10 text-primary" : "hover:bg-secondary"}`} onClick={() => setAnalyticsTab(tab.id)}>{tab.label}</button>
              ))}
            </div>
            {renderAnalyticsContent()}
          </div>
        );
      case "compliance":
        return <ComplianceAudit rules={hubAnalytics.compliance_rules} loading={hubLoading} />;
      case "risk":
        return <RiskHeatMap risks={hubAnalytics.risk_items} loading={hubLoading} />;
      case "ai":
        return <AIInsightsPanel insights={hubAnalytics.insights} loading={hubLoading} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Procurement Hub</h1>
          <p className="text-xs text-muted">Command center for purchasing operations</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="app-button-secondary" onClick={goImportPOs}>
            <FileUp className="h-4 w-4" /> Bulk Import
          </button>
          <button className="app-button" onClick={goCreatePO}>
            <Plus className="h-4 w-4" /> New Purchase Order
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
              section === item.id
                ? "border-primary/30 bg-primary/10 text-primary shadow-sm"
                : "hover:bg-secondary hover:shadow-sm"
            }`}
            onClick={() => handleNavClick(item.id)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {renderSection()}
      {addSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={() => setAddSupplierOpen(false)}>
          <div className="app-card w-full max-w-md space-y-5 p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Procurement</p>
                <h3 className="text-lg font-semibold">Add Supplier</h3>
              </div>
              <button className="app-button-ghost" onClick={() => setAddSupplierOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            {addError ? <p className="text-sm text-danger">{addError}</p> : null}
            <div className="space-y-3">
              <label className="block space-y-1 text-sm font-medium">
                Name <span className="text-danger">*</span>
                <input className="app-input w-full" value={addForm.name} onChange={(event) => setAddForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Supplier name" autoFocus />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-muted" /> Email</span>
                <input className="app-input w-full" type="email" value={addForm.email} onChange={(event) => setAddForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="name@supplier.com" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-sm font-medium">
                  <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-muted" /> Phone</span>
                  <input className="app-input w-full" value={addForm.phone} onChange={(event) => setAddForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Phone number" />
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted" /> Address</span>
                  <input className="app-input w-full" value={addForm.address} onChange={(event) => setAddForm((prev) => ({ ...prev, address: event.target.value }))} placeholder="Business address" />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <button className="app-button-secondary" onClick={() => setAddSupplierOpen(false)}>Cancel</button>
              <button className="app-button" onClick={() => void createSupplier()} disabled={addSaving}>
                {addSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {addSaving ? "Creating..." : "Create Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
