import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNavigate, useParams } from "react-router-dom";
import { Building2, Download, FileUp, Plus, Search, Settings2, X } from "lucide-react";
import { apiFetch } from "../api";
import SupplierItemLinkModal, { SupplierItemLinkForm } from "../components/SupplierItemLinkModal";
import { formatCurrency } from "../utils/formatters";

type Supplier = {
  id: number;
  vendor_number?: string | null;
  name: string;
  legal_name?: string | null;
  website?: string | null;
  tax_id?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  remit_to_address?: string | null;
  ship_from_address?: string | null;
  status: "active" | "inactive";
  default_lead_time_days?: number | null;
  payment_terms?: string | null;
  currency?: string | null;
  shipping_terms?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

type SupplierSummary = {
  active_suppliers: number;
  suppliers_with_open_pos: number;
  average_lead_time_days: number;
  on_time_delivery_percent: number;
  catalog_coverage_percent: number;
};

type SupplierItem = {
  id: number;
  supplier_id: number;
  item_id: number;
  item_name: string;
  item_sku?: string | null;
  supplier_sku?: string | null;
  default_unit_cost: number | string;
  item_unit_price: number | string;
  lead_time_days?: number | null;
  min_order_qty?: number | null;
  is_active: boolean;
  is_preferred: boolean;
};

type Item = { id: number; name: string; sku?: string | null; unit_price: number | string };
type SupplierCatalogMetrics = { count: number; preferred: number };
type Queue = "all" | "needs_attention" | "active" | "inactive" | "missing_catalog" | "high_lead_time";

const ranges = ["MTD", "QTD", "YTD", "12M"];
const queueOptions: Array<{ key: Queue; label: string }> = [
  { key: "needs_attention", label: "Needs Attention" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
  { key: "missing_catalog", label: "Missing Catalog" },
  { key: "high_lead_time", label: "High Lead Time" },
  { key: "all", label: "All Suppliers" },
];

const emptyForm = {
  vendor_number: "",
  name: "",
  legal_name: "",
  website: "",
  tax_id: "",
  status: "active" as "active" | "inactive",
  contact_name: "",
  email: "",
  phone: "",
  remit_to_address: "",
  ship_from_address: "",
  default_lead_time_days: "",
  payment_terms: "Net 30",
  currency: "USD",
  shipping_terms: "",
  notes: "",
};


const emptyCatalogLinkForm: SupplierItemLinkForm = {
  related_id: "",
  supplier_cost: "",
  freight_cost: "",
  tariff_cost: "",
  supplier_sku: "",
  lead_time_days: "",
  min_order_qty: "",
  notes: "",
  is_preferred: false,
};

const supplierToForm = (supplier: Supplier) => ({
  vendor_number: supplier.vendor_number ?? "",
  name: supplier.name,
  legal_name: supplier.legal_name ?? "",
  website: supplier.website ?? "",
  tax_id: supplier.tax_id ?? "",
  status: supplier.status,
  contact_name: supplier.contact_name ?? "",
  email: supplier.email ?? "",
  phone: supplier.phone ?? "",
  remit_to_address: supplier.remit_to_address ?? "",
  ship_from_address: supplier.ship_from_address ?? "",
  default_lead_time_days: supplier.default_lead_time_days?.toString() ?? "",
  payment_terms: supplier.payment_terms ?? "Net 30",
  currency: supplier.currency ?? "USD",
  shipping_terms: supplier.shipping_terms ?? "",
  notes: supplier.notes ?? "",
});

export default function SuppliersPage() {
  const navigate = useNavigate();
  const { id: supplierRouteId } = useParams<{ id?: string }>();
  const routeSupplierId = supplierRouteId ? Number(supplierRouteId) : null;
  const isSupplierDetailPage = Number.isFinite(routeSupplierId);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierUniverse, setSupplierUniverse] = useState<Supplier[]>([]);
  const [supplierCatalogMetrics, setSupplierCatalogMetrics] = useState<Record<number, SupplierCatalogMetrics>>({});
  const [summary, setSummary] = useState<SupplierSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [queue, setQueue] = useState<Queue>("all");
  const [range, setRange] = useState("YTD");
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [catalog, setCatalog] = useState<SupplierItem[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [columnsCompact, setColumnsCompact] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogLinkForm, setCatalogLinkForm] = useState<SupplierItemLinkForm>(emptyCatalogLinkForm);
  const [formErrors, setFormErrors] = useState<{ name?: string; email?: string; website?: string }>({});
  const [formSubmitError, setFormSubmitError] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [toast, setToast] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const routeSupplierHandledRef = useRef<string | null>(null);

  const loadSuppliers = async () => {
    if (isSupplierDetailPage && routeSupplierId) {
      setLoading(true);
      setRefreshing(false);
      setError("");
      try {
        const [supplierData, supplierCatalogData, itemData] = await Promise.all([
          apiFetch<Supplier>(`/suppliers/${routeSupplierId}`),
          apiFetch<SupplierItem[]>(`/suppliers/${routeSupplierId}/items`),
          apiFetch<Item[]>("/items"),
        ]);
        setSelected(supplierData);
        setCatalog(supplierCatalogData);
        setItems(itemData);
        setSuppliers([]);
        setSupplierUniverse([]);
        setSupplierCatalogMetrics({});
        setSummary(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
      return;
    }

    const showInitialLoading = suppliers.length === 0 && supplierUniverse.length === 0 && summary === null;
    if (showInitialLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError("");
    try {
      const supplierSearch = encodeURIComponent(debouncedSearch);
      const [supplierData, supplierUniverseData, summaryData, itemData] = await Promise.all([
        apiFetch<Supplier[]>(`/suppliers?search=${supplierSearch}&queue=${queue === "all" ? "" : queue}`),
        apiFetch<Supplier[]>(`/suppliers?search=${supplierSearch}&queue=`),
        apiFetch<SupplierSummary>(`/suppliers/summary?range=${range}`),
        apiFetch<Item[]>("/items"),
      ]);
      const catalogMetricsEntries = await Promise.all(
        supplierUniverseData.map(async (supplier) => {
          try {
            const supplierCatalog = await apiFetch<SupplierItem[]>(`/suppliers/${supplier.id}/items`);
            return [
              supplier.id,
              {
                count: supplierCatalog.length,
                preferred: supplierCatalog.filter((entry) => entry.is_preferred).length,
              },
            ] as const;
          } catch {
            return [supplier.id, { count: 0, preferred: 0 }] as const;
          }
        }),
      );
      setSuppliers(supplierData);
      setSupplierUniverse(supplierUniverseData);
      setSupplierCatalogMetrics(Object.fromEntries(catalogMetricsEntries));
      setSummary(summaryData);
      setItems(itemData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => { void loadSuppliers(); }, [debouncedSearch, queue, range, isSupplierDetailPage, routeSupplierId]);

  const routeSupplier = useMemo(() => {
    if (!routeSupplierId) return null;
    return selected?.id === routeSupplierId
      ? selected
      : supplierUniverse.find((supplier) => supplier.id === routeSupplierId) ?? suppliers.find((supplier) => supplier.id === routeSupplierId) ?? null;
  }, [routeSupplierId, selected, supplierUniverse, suppliers]);

  useEffect(() => {
    if (!isSupplierDetailPage || !supplierRouteId) {
      routeSupplierHandledRef.current = null;
      return;
    }

    if (routeSupplierHandledRef.current === supplierRouteId) {
      return;
    }

    if (!routeSupplier) {
      return;
    }

    if (!Number.isFinite(Number(supplierRouteId))) {
      routeSupplierHandledRef.current = supplierRouteId;
      return;
    }

    routeSupplierHandledRef.current = supplierRouteId;
    const nextForm = supplierToForm(routeSupplier);
    setEditingId(routeSupplier.id);
    setForm(nextForm);
    setInitialForm(nextForm);
    setFormErrors({});
    setFormSubmitError("");
    setShowForm(false);
  }, [supplierRouteId, routeSupplier]);

  const loadCatalog = async (supplierId: number) => {
    try {
      const data = await apiFetch<SupplierItem[]>(`/suppliers/${supplierId}/items`);
      setCatalog(data);
    } catch {
      setCatalog([]);
    }
  };

  const queueCounts = useMemo(() => ({
    needs_attention: supplierUniverse.filter((s) => !s.email || !s.phone || !s.remit_to_address).length,
    active: supplierUniverse.filter((s) => s.status === "active").length,
    inactive: supplierUniverse.filter((s) => s.status === "inactive").length,
    missing_catalog: supplierUniverse.filter((s) => s.status === "active").filter((s) => (supplierCatalogMetrics[s.id]?.count ?? 0) === 0).length,
    high_lead_time: supplierUniverse.filter((s) => (s.default_lead_time_days ?? 0) > 30).length,
    all: supplierUniverse.length,
  }), [supplierUniverse, supplierCatalogMetrics]);

  const spendData = supplierUniverse.slice(0, 10).map((s) => ({ name: s.name, spend: 0 }));
  const leadTimeData = [0, 7, 14, 30, 45].map((bucket, index) => ({ bucket: `${bucket}+`, count: supplierUniverse.filter((s) => (s.default_lead_time_days ?? 0) >= bucket && (index === 4 || (s.default_lead_time_days ?? 0) < [7, 14, 30, 45, 999][index + 1])).length }));
  const onTimeData = [{ name: "On-time", value: summary?.on_time_delivery_percent ?? 0 }, { name: "Late", value: 100 - (summary?.on_time_delivery_percent ?? 0) }];
  const linkedItemIds = useMemo(() => new Set(catalog.map((row) => row.item_id)), [catalog]);
  const catalogCandidates = useMemo(() => items.filter((item) => !linkedItemIds.has(item.id)), [items, linkedItemIds]);
  const selectedCatalogItem = useMemo(
    () => catalogCandidates.find((item) => item.id === Number(catalogLinkForm.related_id)) ?? null,
    [catalogCandidates, catalogLinkForm.related_id],
  );
  const visibleSupplierIds = useMemo(() => suppliers.map((supplier) => supplier.id), [suppliers]);
  const allVisibleSelected = visibleSupplierIds.length > 0 && visibleSupplierIds.every((id) => selectedRows.includes(id));
  const someVisibleSelected = visibleSupplierIds.some((id) => selectedRows.includes(id));

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);


  const saveSupplier = async (addCatalog = false) => {
    const nextErrors: { name?: string; email?: string; website?: string } = {};
    if (!form.name.trim()) nextErrors.name = "Supplier name is required.";
    const emailValid = !form.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
    const urlValid = !form.website || /^https?:\/\//.test(form.website);
    if (!emailValid) nextErrors.email = "Enter a valid email.";
    if (!urlValid) nextErrors.website = "Website must start with http:// or https://";
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setFormSubmitError("");
    setError("");
    setSavingSupplier(true);
    const payload = {
      vendor_number: form.vendor_number.trim() || null,
      name: form.name.trim(),
      legal_name: form.legal_name.trim() || null,
      website: form.website.trim() || null,
      tax_id: form.tax_id.trim() || null,
      status: form.status,
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      remit_to_address: form.remit_to_address.trim() || null,
      ship_from_address: form.ship_from_address.trim() || null,
      default_lead_time_days: form.default_lead_time_days ? Number(form.default_lead_time_days) : null,
      payment_terms: form.payment_terms.trim() || null,
      currency: form.currency.trim() || "USD",
      shipping_terms: form.shipping_terms.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      let saved: Supplier;
      if (editingId) {
        saved = await apiFetch<Supplier>(`/suppliers/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        saved = await apiFetch<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setForm(emptyForm);
      setInitialForm(emptyForm);
      setEditingId(null);
      setFormErrors({});
      setFormSubmitError("");
      setToast(editingId ? "Supplier updated" : "Supplier created");
      await loadSuppliers();
      if (selected?.id === saved.id) {
        setSelected(saved);
      }
      if (addCatalog) {
        setSelected(saved);
        await loadCatalog(saved.id);
        openCatalogPicker();
      }
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      setFormSubmitError(message);
    } finally {
      setSavingSupplier(false);
    }
  };

  const toggleBulkStatus = async (status: "active" | "inactive") => {
    await Promise.all(selectedRows.map((id) => apiFetch(`/suppliers/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) })));
    setSelectedRows([]);
    await loadSuppliers();
  };

  const deleteSelectedSuppliers = async () => {
    if (selectedRows.length === 0) return;
    const confirmed = window.confirm(
      `Delete ${selectedRows.length} selected supplier${selectedRows.length === 1 ? "" : "s"}? Referenced suppliers will fail and remain in place.`,
    );
    if (!confirmed) return;

    setError("");
    try {
      const results = await Promise.allSettled(
        selectedRows.map((id) => apiFetch(`/suppliers/${id}`, { method: "DELETE" })),
      );
      const failed = results.filter((result) => result.status === "rejected").length;
      const deleted = results.length - failed;
      setSelectedRows([]);
      await loadSuppliers();
      if (failed > 0) {
        setError(
          `${failed} supplier${failed === 1 ? "" : "s"} could not be deleted because they are referenced by other records.`,
        );
      }
      if (deleted > 0) {
        setToast(`${deleted} supplier${deleted === 1 ? "" : "s"} deleted`);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggleSelectAllVisible = () => {
    setSelectedRows((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleSupplierIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleSupplierIds]));
    });
  };

  const toggleSupplierSelection = (supplierId: number) => {
    setSelectedRows((prev) => (prev.includes(supplierId) ? prev.filter((id) => id !== supplierId) : [...prev, supplierId]));
  };

  const openCatalogPicker = () => {
    setCatalogLinkForm(emptyCatalogLinkForm);
    setCatalogPickerOpen(true);
  };

  const addCatalogItems = async () => {
    if (!selected || !catalogLinkForm.related_id) return;

    const payloadEntry: Record<string, unknown> = {
      item_id: Number(catalogLinkForm.related_id),
    };

    if (catalogLinkForm.supplier_sku.trim()) payloadEntry.supplier_sku = catalogLinkForm.supplier_sku.trim();
    if (catalogLinkForm.lead_time_days) payloadEntry.lead_time_days = Number(catalogLinkForm.lead_time_days);
    if (catalogLinkForm.min_order_qty) payloadEntry.min_order_qty = Number(catalogLinkForm.min_order_qty);
    if (catalogLinkForm.notes.trim()) payloadEntry.notes = catalogLinkForm.notes.trim();
    if (catalogLinkForm.is_preferred) payloadEntry.is_preferred = true;

    await apiFetch(`/suppliers/${selected.id}/items`, {
      method: "POST",
      body: JSON.stringify(payloadEntry),
    });
    setCatalogPickerOpen(false);
    setCatalogLinkForm(emptyCatalogLinkForm);
    await loadCatalog(selected.id);
  };

  const updateCatalogLinkForm = (next: SupplierItemLinkForm) => {
    if (next.related_id !== catalogLinkForm.related_id) {
      const nextItem = catalogCandidates.find((item) => item.id === Number(next.related_id));
      setCatalogLinkForm({
        ...next,
        supplier_cost: nextItem ? Number(nextItem.unit_price ?? 0).toFixed(2) : "",
      });
      return;
    }

    setCatalogLinkForm(next);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setFormErrors({});
    setFormSubmitError("");
    setShowForm(true);
  };

  const openEditModal = (supplier: Supplier) => {
    const nextForm = supplierToForm(supplier);
    setEditingId(supplier.id);
    setForm(nextForm);
    setInitialForm(nextForm);
    setFormErrors({});
    setFormSubmitError("");
    setShowForm(true);
  };

  const formDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);
  const requestCloseModal = () => {
    if (formDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    setShowForm(false);
    setEditingId(null);
    setFormErrors({});
    setFormSubmitError("");
    setForm(emptyForm);
    setInitialForm(emptyForm);
    if (supplierRouteId) {
      navigate("/procurement/suppliers", { replace: true });
    }
  };

  useEffect(() => {
    if (!showForm) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>(focusableSelector);
    focusable?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestCloseModal();
      }
      if (event.key === "Tab" && focusable && focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showForm, formDirty]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Suppliers Workbench</h1>
          <p className="text-muted">Manage vendors, catalogs, lead times, and purchasing performance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ranges.map((r) => <button key={r} className={`app-button-secondary ${range === r ? "ring-2 ring-primary/30" : ""}`} onClick={() => setRange(r)}>{r}</button>)}
          <a className="app-button-secondary inline-flex items-center gap-2" href="/procurement/suppliers/import"><FileUp className="h-4 w-4" /> Import</a>
          <button className="app-button-secondary"><Download className="h-4 w-4" /> Export</button>
          <button className="app-button" onClick={openCreateModal}><Plus className="h-4 w-4" /> New Supplier</button>
        </div>
      </header>

      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {toast ? <div className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">{toast}</div> : null}

      {isSupplierDetailPage ? (
        loading && !routeSupplier ? (
          <div className="h-52 animate-pulse rounded-xl bg-secondary" />
        ) : routeSupplier ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <button className="app-button-ghost" onClick={() => navigate("/procurement/suppliers")}>Back to Suppliers</button>
              <div className="flex flex-wrap gap-2">
                <button className="app-button-secondary" onClick={() => void saveSupplier(false)} disabled={savingSupplier}>Save Draft</button>
                <button className="app-button" onClick={() => void saveSupplier(false)} disabled={savingSupplier}>{savingSupplier ? "Saving..." : "Save"}</button>
                <button className="app-button-secondary" onClick={() => void saveSupplier(true)} disabled={savingSupplier}>Save & Add Catalog Items</button>
              </div>
            </div>

            <div className="app-card p-6">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold">{routeSupplier.name}</h2>
                <p className="text-sm text-muted">Supplier detail and procurement master data.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {formSubmitError ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger md:col-span-2">{formSubmitError}</div> : null}
                <label className="text-sm">Vendor Number<input className="app-input mt-1 w-full" value={form.vendor_number} onChange={(e) => setForm((p) => ({ ...p, vendor_number: e.target.value }))} /></label>
                <label className="text-sm">Status<select className="app-input mt-1 w-full" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as "active" | "inactive" }))}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
                <label className="text-sm md:col-span-2">Supplier name *<input className="app-input mt-1 w-full" value={form.name} onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setFormErrors((prev) => ({ ...prev, name: undefined })); }} />{formErrors.name ? <span className="mt-1 block text-xs text-danger">{formErrors.name}</span> : null}</label>
                <label className="text-sm">Legal name<input className="app-input mt-1 w-full" value={form.legal_name} onChange={(e) => setForm((p) => ({ ...p, legal_name: e.target.value }))} /></label>
                <label className="text-sm">Website<input className="app-input mt-1 w-full" value={form.website} onChange={(e) => { setForm((p) => ({ ...p, website: e.target.value })); setFormErrors((prev) => ({ ...prev, website: undefined })); }} placeholder="https://" />{formErrors.website ? <span className="mt-1 block text-xs text-danger">{formErrors.website}</span> : null}</label>
                <label className="text-sm">Contact name<input className="app-input mt-1 w-full" value={form.contact_name} onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))} /></label>
                <label className="text-sm">Email<input className="app-input mt-1 w-full" value={form.email} onChange={(e) => { setForm((p) => ({ ...p, email: e.target.value })); setFormErrors((prev) => ({ ...prev, email: undefined })); }} />{formErrors.email ? <span className="mt-1 block text-xs text-danger">{formErrors.email}</span> : null}</label>
                <label className="text-sm">Phone<input className="app-input mt-1 w-full" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label>
                <label className="text-sm">Tax ID<input className="app-input mt-1 w-full" value={form.tax_id} onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))} /></label>
                <label className="text-sm md:col-span-2">Remit-to address<textarea className="app-input mt-1 w-full" value={form.remit_to_address} onChange={(e) => setForm((p) => ({ ...p, remit_to_address: e.target.value }))} /></label>
                <label className="text-sm md:col-span-2">Ship-from address<textarea className="app-input mt-1 w-full" value={form.ship_from_address} onChange={(e) => setForm((p) => ({ ...p, ship_from_address: e.target.value }))} /></label>
                <label className="text-sm">Lead time days<input className="app-input mt-1 w-full" type="number" min={0} value={form.default_lead_time_days} onChange={(e) => setForm((p) => ({ ...p, default_lead_time_days: e.target.value }))} /></label>
                <label className="text-sm">Payment terms<input className="app-input mt-1 w-full" value={form.payment_terms} onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))} /></label>
                <label className="text-sm">Currency<input className="app-input mt-1 w-full" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} /></label>
                <label className="text-sm">Shipping terms<input className="app-input mt-1 w-full" value={form.shipping_terms} onChange={(e) => setForm((p) => ({ ...p, shipping_terms: e.target.value }))} /></label>
                <label className="text-sm md:col-span-2">Notes<textarea className="app-input mt-1 w-full" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></label>
              </div>
            </div>

            <div className="app-card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">Supplier Catalog</h3>
                  <p className="text-sm text-muted">Items currently linked to this supplier.</p>
                </div>
                <button className="app-button-secondary" onClick={openCatalogPicker}>Link Item</button>
              </div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th>Item</th>
                      <th>SKU</th>
                      <th>Supplier SKU</th>
                      <th>Cost</th>
                      <th>Landed</th>
                      <th>Lead Time</th>
                      <th>MOQ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.length === 0 ? (
                      <tr><td colSpan={7} className="border-t py-6 text-center text-muted">No catalog items linked yet.</td></tr>
                    ) : catalog.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="py-3">{row.item_name}</td>
                        <td>{row.item_sku ?? "-"}</td>
                        <td>{row.supplier_sku ?? "-"}</td>
                        <td>{formatCurrency(row.default_unit_cost)}</td>
                        <td>{formatCurrency(Number(row.default_unit_cost ?? 0))}</td>
                        <td>{row.lead_time_days ?? "-"}</td>
                        <td>{row.min_order_qty ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="app-card p-6">
            <h2 className="text-xl font-semibold">Supplier not found</h2>
            <p className="mt-2 text-sm text-muted">The requested supplier could not be found.</p>
            <button className="app-button mt-4" onClick={() => navigate("/procurement/suppliers")}>Back to Suppliers</button>
          </div>
        )
      ) : (
      <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {[
          { label: "Active Suppliers", value: summary?.active_suppliers ?? 0, onClick: () => setQueue("active") },
          { label: "Suppliers with Open POs", value: summary?.suppliers_with_open_pos ?? 0, onClick: () => setQueue("all") },
          { label: "Average Lead Time", value: `${Math.round(summary?.average_lead_time_days ?? 0)}d`, onClick: () => setQueue("high_lead_time") },
          { label: "On-Time Delivery %", value: `${Math.round(summary?.on_time_delivery_percent ?? 0)}%`, onClick: () => setQueue("all") },
          { label: "Catalog Coverage", value: `${Math.round(summary?.catalog_coverage_percent ?? 0)}%`, onClick: () => setQueue("missing_catalog") },
        ].map((tile) => (
          <button key={tile.label} className="app-card p-4 text-left transition hover:-translate-y-0.5" onClick={tile.onClick}>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <aside className="app-card space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Work Queues</p>
          {queueOptions.map((q) => (
            <button key={q.key} onClick={() => setQueue(q.key)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${queue === q.key ? "bg-primary text-primary-foreground" : "bg-secondary/60"}`}>
              <span>{q.label}</span><span>{queueCounts[q.key]}</span>
            </button>
          ))}
        </aside>

        <div className="space-y-4 xl:col-span-3">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="app-card h-64 p-4"><p className="mb-2 text-sm font-semibold">Spend by Supplier (Top 10)</p><ResponsiveContainer width="100%" height="90%"><BarChart data={spendData}><XAxis dataKey="name" hide /><YAxis hide /><Tooltip /><Bar dataKey="spend" fill="#4f46e5" /></BarChart></ResponsiveContainer></div>
            <div className="app-card h-64 p-4"><p className="mb-2 text-sm font-semibold">Lead Time Distribution</p><ResponsiveContainer width="100%" height="90%"><BarChart data={leadTimeData}><XAxis dataKey="bucket" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#0891b2" /></BarChart></ResponsiveContainer></div>
            <div className="app-card h-64 p-4"><p className="mb-2 text-sm font-semibold">On-Time vs Late</p><ResponsiveContainer width="100%" height="90%"><PieChart><Pie data={onTimeData} dataKey="value" innerRadius={50} outerRadius={80}>{onTimeData.map((_, i) => <Cell key={i} fill={i === 0 ? "#16a34a" : "#dc2626"} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
            <div className="app-card h-64 p-4"><p className="mb-2 text-sm font-semibold">PO Volume Trend</p><ResponsiveContainer width="100%" height="90%"><LineChart data={[{ month: "M-3", value: 0 }, { month: "M-2", value: 0 }, { month: "M-1", value: 0 }, { month: "Now", value: 0 }]}><XAxis dataKey="month" /><YAxis /><Tooltip /><Line dataKey="value" stroke="#7c3aed" /></LineChart></ResponsiveContainer></div>
          </div>

          <div className="app-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted" /><input className="app-input w-72" placeholder="Search suppliers" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <div className="flex gap-2">
                {refreshing ? <div className="self-center text-xs text-muted">Refreshing...</div> : null}
                <button className="app-button-secondary" onClick={() => setColumnsCompact((p) => !p)}><Settings2 className="h-4 w-4" /> Density</button>
                {selectedRows.length > 0 ? <><button className="app-button-secondary" onClick={() => void toggleBulkStatus("active")}>Activate</button><button className="app-button-secondary" onClick={() => void toggleBulkStatus("inactive")}>Deactivate</button><button className="app-button-secondary" onClick={() => void deleteSelectedSuppliers()}>Delete</button></> : null}
              </div>
            </div>
            {loading ? <div className="h-52 animate-pulse rounded-xl bg-secondary" /> : suppliers.length === 0 ? (
              <div className="rounded-xl border border-dashed p-10 text-center"><Building2 className="mx-auto mb-2 h-8 w-8 text-muted" /><p className="text-lg font-semibold">No suppliers yet</p><p className="text-sm text-muted">Add your first supplier or import your vendor master.</p><div className="mt-4 flex justify-center gap-2"><button className="app-button" onClick={openCreateModal}>Add your first supplier</button><a className="app-button-secondary inline-flex items-center gap-2" href="/procurement/suppliers/import">Import suppliers</a></div></div>
            ) : (
              <div className="overflow-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th><input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Select all visible suppliers" /></th><th>Supplier Name</th><th>Status</th><th>Primary Contact</th><th>Email</th><th>Phone</th><th>Lead Time</th><th>Catalog Items</th><th>Preferred Items</th><th>Spend (YTD)</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{suppliers.map((s) => { const count = supplierCatalogMetrics[s.id]?.count ?? 0; return <tr key={s.id} className={`border-t ${columnsCompact ? "" : "h-14"}`}><td><input type="checkbox" checked={selectedRows.includes(s.id)} onChange={() => toggleSupplierSelection(s.id)} aria-label={`Select supplier ${s.name}`} /></td><td><button className="font-medium hover:underline" onClick={() => openEditModal(s)}>{s.name}</button></td><td><span className={`app-badge ${s.status === "active" ? "border-success/30 bg-success/10 text-success" : ""}`}>{s.status}</span></td><td>{s.contact_name ?? "-"}</td><td>{s.email ?? "-"}</td><td>{s.phone ?? "-"}</td><td>{s.default_lead_time_days ?? "-"}</td><td>{count}</td><td>{supplierCatalogMetrics[s.id]?.preferred ?? 0}</td><td>{formatCurrency(0)}</td><td>{new Date(s.updated_at).toLocaleDateString()}</td><td><div className="flex gap-2"><button className="app-button-ghost" onClick={() => openEditModal(s)}>View</button><button className="app-button-ghost" onClick={() => openEditModal(s)}>Edit</button><button className="app-button-ghost" onClick={() => { setSelected(s); void loadCatalog(s.id); openCatalogPicker(); }}>Map Items</button></div></td></tr>; })}</tbody></table></div>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {showForm && !isSupplierDetailPage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50" onClick={requestCloseModal}>
          <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="supplier-modal-title" className="app-card flex max-h-[88vh] w-[min(95vw,1000px)] flex-col overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b px-6 py-4">
              <div>
                <h2 id="supplier-modal-title" className="text-xl font-semibold">{editingId ? "Edit Supplier" : "New Supplier"}</h2>
                <p className="text-sm text-muted">Create or update supplier master data for procurement.</p>
              </div>
              <button className="app-button-ghost" aria-label="Close supplier modal" onClick={requestCloseModal}><X className="h-4 w-4" /></button>
            </div>
            <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-5 md:grid-cols-2">
              {formSubmitError ? <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger md:col-span-2">{formSubmitError}</div> : null}
              <label className="text-sm">Vendor Number<input className="app-input mt-1 w-full" value={form.vendor_number} onChange={(e) => setForm((p) => ({ ...p, vendor_number: e.target.value }))} /></label>
              <label className="text-sm md:col-span-2">Supplier name *<input className="app-input mt-1 w-full" value={form.name} onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); setFormErrors((prev) => ({ ...prev, name: undefined })); }} />{formErrors.name ? <span className="mt-1 block text-xs text-danger">{formErrors.name}</span> : null}</label>
              <label className="text-sm">Legal name<input className="app-input mt-1 w-full" value={form.legal_name} onChange={(e) => setForm((p) => ({ ...p, legal_name: e.target.value }))} /></label>
              <label className="text-sm">Website<input className="app-input mt-1 w-full" value={form.website} onChange={(e) => { setForm((p) => ({ ...p, website: e.target.value })); setFormErrors((prev) => ({ ...prev, website: undefined })); }} placeholder="https://" />{formErrors.website ? <span className="mt-1 block text-xs text-danger">{formErrors.website}</span> : null}</label>
              <label className="text-sm">Contact name<input className="app-input mt-1 w-full" value={form.contact_name} onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))} /></label>
              <label className="text-sm">Email<input className="app-input mt-1 w-full" value={form.email} onChange={(e) => { setForm((p) => ({ ...p, email: e.target.value })); setFormErrors((prev) => ({ ...prev, email: undefined })); }} />{formErrors.email ? <span className="mt-1 block text-xs text-danger">{formErrors.email}</span> : null}</label>
              <label className="text-sm">Phone<input className="app-input mt-1 w-full" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></label>
              <label className="text-sm">Tax ID<input className="app-input mt-1 w-full" value={form.tax_id} onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))} /></label>
              <label className="text-sm md:col-span-2">Remit-to address<textarea className="app-input mt-1 w-full" value={form.remit_to_address} onChange={(e) => setForm((p) => ({ ...p, remit_to_address: e.target.value }))} /></label>
              <label className="text-sm md:col-span-2">Ship-from address<textarea className="app-input mt-1 w-full" value={form.ship_from_address} onChange={(e) => setForm((p) => ({ ...p, ship_from_address: e.target.value }))} /></label>
              <label className="text-sm">Lead time days<input className="app-input mt-1 w-full" type="number" min={0} value={form.default_lead_time_days} onChange={(e) => setForm((p) => ({ ...p, default_lead_time_days: e.target.value }))} /></label>
              <label className="text-sm">Payment terms<input className="app-input mt-1 w-full" value={form.payment_terms} onChange={(e) => setForm((p) => ({ ...p, payment_terms: e.target.value }))} /></label>
              <label className="text-sm">Currency<input className="app-input mt-1 w-full" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} /></label>
            </div>
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-background px-6 py-4">
              <button className="app-button-ghost" onClick={requestCloseModal}>Cancel</button>
              <div className="flex flex-wrap gap-2">
                <button className="app-button-secondary" onClick={() => void saveSupplier(false)} disabled={savingSupplier}>Save Draft</button>
                <button className="app-button" onClick={() => void saveSupplier(false)} disabled={savingSupplier}>{savingSupplier ? "Saving..." : "Save"}</button>
                <button className="app-button-secondary" onClick={() => void saveSupplier(true)} disabled={savingSupplier}>Save & Add Catalog Items</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showDiscardConfirm ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50">
          <div className="app-card w-full max-w-md p-5">
            <h3 className="text-lg font-semibold">Discard changes?</h3>
            <p className="mt-2 text-sm text-muted">You have unsaved edits. Do you want to discard them?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="app-button-secondary" onClick={() => setShowDiscardConfirm(false)}>Keep editing</button>
              <button className="app-button" onClick={() => { setShowDiscardConfirm(false); setShowForm(false); setEditingId(null); setForm(emptyForm); setInitialForm(emptyForm); setFormErrors({}); setFormSubmitError(""); if (supplierRouteId) { navigate("/procurement/suppliers", { replace: true }); } }}>Discard</button>
            </div>
          </div>
        </div>
      ) : null}

      {catalogPickerOpen && selected ? (
        <SupplierItemLinkModal
          isOpen={catalogPickerOpen}
          title={`Link Item to ${selected.name}`}
          subtitle="Supplier catalog link"
          entityLabel="Item"
          options={catalogCandidates.map((item) => ({
            value: item.id.toString(),
            label: item.name,
            description: item.sku ?? undefined,
          }))}
          form={catalogLinkForm}
          itemSku={selectedCatalogItem?.sku ?? "-"}
          unitPrice={selectedCatalogItem ? formatCurrency(selectedCatalogItem.unit_price) : "$0.00"}
          primaryActionLabel="Link Item"
          onClose={() => {
            setCatalogPickerOpen(false);
            setCatalogLinkForm(emptyCatalogLinkForm);
          }}
          onSubmit={() => void addCatalogItems()}
          onChange={updateCatalogLinkForm}
        />
      ) : null}
    </section>
  );
}


