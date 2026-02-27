import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Users, BarChart3, Shield, AlertTriangle, Sparkles,
  Plus, X, Loader2, Mail, Phone, MapPin,
} from "lucide-react";
import POKpiCards from "../../components/purchasing/POKpiCards";
import SpendAnalysisChart from "../../components/purchasing/SpendAnalysisChart";
import VendorPerformanceRadar from "../../components/purchasing/VendorPerformanceRadar";
import P2PCycleTime from "../../components/purchasing/P2PCycleTime";
import ComplianceAudit from "../../components/purchasing/ComplianceAudit";
import RiskHeatMap from "../../components/purchasing/RiskHeatMap";
import AIInsightsPanel from "../../components/purchasing/AIInsightsPanel";
import POTable from "../../components/purchasing/POTable";
import { apiFetch, getPurchaseOrder } from "../../api";

/* ── Types ── */
type Section = "dashboard" | "orders" | "vendors" | "analytics" | "compliance" | "risk" | "ai";

type Supplier = { id: number; name: string; email?: string | null; phone?: string | null; address?: string | null; created_at?: string };

type PODetailLine = { id: number; item_id: number; item_name: string; quantity: number; unit_cost: number };
type PODetail = {
  id: number; po_number: string; supplier_id: number; supplier_name?: string;
  order_date: string; expected_date?: string | null; notes?: string | null;
  freight_cost: number; tariff_cost: number; status: string; total?: number;
  lines: PODetailLine[];
};

/* ── Nav config ── */
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
];

export default function POHubPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("dashboard");
  const [analyticsTab, setAnalyticsTab] = useState("spend");

  // Detail slide-out
  const [detailPO, setDetailPO] = useState<PODetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Vendor management
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "", address: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const goCreatePO = () => navigate("/purchasing/purchase-orders/new");

  /* ── PO Detail ── */
  const handleViewPO = async (po: { id: number; po_number: string; supplier_name: string; order_date: string; expected_date?: string | null; status: string; total: number }) => {
    setDetailLoading(true);
    setDetailPO({ id: po.id, po_number: po.po_number, supplier_id: 0, supplier_name: po.supplier_name, order_date: po.order_date, expected_date: po.expected_date || null, status: po.status, total: po.total, freight_cost: 0, tariff_cost: 0, lines: [] });
    try {
      const detail = await getPurchaseOrder<PODetail>(po.id);
      setDetailPO({ ...detail, supplier_name: detail.supplier_name || po.supplier_name });
    } catch { /* keep basic info */ } finally { setDetailLoading(false); }
  };

  /* ── Supplier CRUD ── */
  const loadSuppliers = async () => {
    setSuppliersLoading(true);
    try { setSuppliers(await apiFetch<Supplier[]>("/suppliers")); }
    catch { setSuppliers([]); }
    finally { setSuppliersLoading(false); }
  };

  useEffect(() => { if (section === "vendors" && suppliers.length === 0) loadSuppliers(); }, [section]);

  const createSupplier = async () => {
    if (!addForm.name.trim()) { setAddError("Supplier name is required."); return; }
    setAddSaving(true); setAddError("");
    try {
      const created = await apiFetch<Supplier>("/suppliers", {
        method: "POST",
        body: JSON.stringify({ name: addForm.name.trim(), email: addForm.email.trim() || null, phone: addForm.phone.trim() || null, address: addForm.address.trim() || null }),
      });
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setAddSupplierOpen(false);
      setAddForm({ name: "", email: "", phone: "", address: "" });
    } catch (err) { setAddError((err as Error).message || "Failed to create supplier."); }
    finally { setAddSaving(false); }
  };

  const deleteSupplier = async (id: number) => {
    if (!window.confirm("Delete this supplier?")) return;
    try { await apiFetch(`/suppliers/${id}`, { method: "DELETE" }); setSuppliers((prev) => prev.filter((s) => s.id !== id)); } catch { /* ignore */ }
  };

  /* ── Section Nav ── */
  const handleNavClick = (id: Section) => {
    setSection(id);
    if (id === "dashboard") setAnalyticsTab("spend");
    else if (id === "vendors") setAnalyticsTab("vendors");
    else if (id === "compliance") setAnalyticsTab("compliance");
    else if (id === "risk") setAnalyticsTab("risk");
    else if (id === "ai") setAnalyticsTab("ai");
    else if (id === "analytics") setAnalyticsTab("spend");
  };

  /* ── Analytics tabs ── */
  const renderAnalyticsContent = () => {
    switch (analyticsTab) {
      case "spend": return <SpendAnalysisChart />;
      case "vendors": return <VendorPerformanceRadar />;
      case "p2p": return <P2PCycleTime />;
      case "compliance": return <ComplianceAudit />;
      case "risk": return <RiskHeatMap />;
      case "ai": return <AIInsightsPanel />;
      default: return <SpendAnalysisChart />;
    }
  };

  /* ── Vendors section ── */
  const renderVendors = () => (
    <div className="space-y-6">
      <VendorPerformanceRadar />

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
                {suppliers.map((s) => (
                  <tr key={s.id} className="app-table-row border-t">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted">{s.email || "—"}</td>
                    <td className="px-4 py-3 text-muted">{s.phone || "—"}</td>
                    <td className="px-4 py-3 text-muted">{s.address || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="app-button-ghost text-danger" onClick={() => deleteSupplier(s.id)}>Delete</button>
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

  /* ── Section content ── */
  const renderSection = () => {
    switch (section) {
      case "dashboard":
        return (
          <div className="space-y-6">
            <POKpiCards />
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
            <div className="flex flex-wrap gap-2">
              {ANALYTICS_TABS.map((tab) => (
                <button key={tab.id} className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${analyticsTab === tab.id ? "border-primary/30 bg-primary/10 text-primary" : "hover:bg-secondary"}`} onClick={() => setAnalyticsTab(tab.id)}>{tab.label}</button>
              ))}
            </div>
            {renderAnalyticsContent()}
          </div>
        );
      case "compliance": return <ComplianceAudit />;
      case "risk": return <RiskHeatMap />;
      case "ai": return <AIInsightsPanel />;
      default: return null;
    }
  };

  const poTotal = detailPO ? (detailPO.total ?? detailPO.lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0) + detailPO.freight_cost + detailPO.tariff_cost) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Procurement Hub</h1>
          <p className="text-xs text-muted">Command center for purchasing operations</p>
        </div>
        <button className="app-button" onClick={goCreatePO}>
          <Plus className="h-4 w-4" /> New Purchase Order
        </button>
      </div>

      {/* Section Nav — horizontal chip navigation */}
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

      {/* Section content */}
      {renderSection()}

      {/* Detail Slide-out */}
      {detailPO && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={() => setDetailPO(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-0 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold">{detailPO.po_number}</h2>
                <p className="text-sm text-muted">{detailPO.supplier_name || `Supplier #${detailPO.supplier_id}`}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`app-badge ${detailPO.status === "DRAFT" ? "border-slate-300 bg-slate-100 text-slate-600" : detailPO.status === "SENT" ? "border-blue-300 bg-blue-50 text-blue-700" : detailPO.status === "RECEIVED" ? "border-green-300 bg-green-50 text-green-700" : "border-slate-300 bg-slate-100 text-slate-600"}`}>
                  {detailPO.status.replace("_", " ")}
                </span>
                <button className="app-button-ghost" onClick={() => setDetailPO(null)}><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="space-y-6 p-6">
              {detailLoading ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted">Loading details...</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border p-3">
                      <span className="text-xs text-muted">Order Date</span>
                      <p className="mt-1 font-semibold">{detailPO.order_date}</p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <span className="text-xs text-muted">Expected Date</span>
                      <p className="mt-1 font-semibold">{detailPO.expected_date || "\u2014"}</p>
                    </div>
                  </div>

                  {detailPO.lines.length > 0 && (
                    <div>
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Line Items</h3>
                      <div className="overflow-hidden rounded-xl border">
                        <table className="w-full text-left text-sm">
                          <thead className="text-xs uppercase text-muted">
                            <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Unit Cost</th><th className="px-3 py-2 text-right">Total</th></tr>
                          </thead>
                          <tbody>
                            {detailPO.lines.map((line) => (
                              <tr key={line.id} className="border-t">
                                <td className="px-3 py-2 font-medium">{line.item_name}</td>
                                <td className="px-3 py-2">{line.quantity}</td>
                                <td className="px-3 py-2">${line.unit_cost.toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-semibold">${(line.quantity * line.unit_cost).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 space-y-1 text-right text-sm">
                        {detailPO.freight_cost > 0 && <p className="text-muted">Freight: ${detailPO.freight_cost.toFixed(2)}</p>}
                        {detailPO.tariff_cost > 0 && <p className="text-muted">Tariff: ${detailPO.tariff_cost.toFixed(2)}</p>}
                        <p className="text-lg font-bold">Total: ${Number(poTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  )}

                  {detailPO.lines.length === 0 && (
                    <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted">No line items.</p>
                  )}

                  {detailPO.notes && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Notes</h3>
                      <p className="whitespace-pre-wrap rounded-xl border p-3 text-sm text-muted">{detailPO.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {addSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4" onClick={() => setAddSupplierOpen(false)}>
          <div className="app-card w-full max-w-md space-y-5 p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Procurement</p>
                <h3 className="text-lg font-semibold">Add Supplier</h3>
              </div>
              <button className="app-button-ghost" onClick={() => setAddSupplierOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            {addError && <p className="text-sm text-danger">{addError}</p>}
            <div className="space-y-3">
              <label className="block space-y-1 text-sm font-medium">
                Name <span className="text-danger">*</span>
                <input className="app-input w-full" value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))} placeholder="Supplier name" autoFocus />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-muted" /> Email</span>
                <input className="app-input w-full" type="email" value={addForm.email} onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))} placeholder="name@supplier.com" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-sm font-medium">
                  <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5 text-muted" /> Phone</span>
                  <input className="app-input w-full" value={addForm.phone} onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone number" />
                </label>
                <label className="block space-y-1 text-sm font-medium">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted" /> Address</span>
                  <input className="app-input w-full" value={addForm.address} onChange={(e) => setAddForm((p) => ({ ...p, address: e.target.value }))} placeholder="Business address" />
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
