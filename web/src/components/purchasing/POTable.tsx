import { useEffect, useMemo, useState } from "react";
import { listPurchaseOrders, deletePurchaseOrder, sendPurchaseOrder } from "../../api";
import { ChevronUp, ChevronDown, Eye, Send, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

type PurchaseOrderListRow = {
  id: number;
  po_number: string;
  supplier_name: string;
  order_date: string;
  expected_date?: string | null;
  status: string;
  total: number;
};

type SortField = "po_number" | "supplier_name" | "order_date" | "status" | "total";
type SortDir = "asc" | "desc";

type Props = {
  onViewPO: (po: PurchaseOrderListRow) => void;
  onCreatePO: () => void;
  refreshKey?: number;
};

const PAGE_OPTIONS = [10, 25, 50];

const statusBadge = (status: string) => {
  const s = status.toLowerCase();
  if (s === "draft") return "app-badge border-slate-300 bg-slate-100 text-slate-600";
  if (s === "sent") return "app-badge border-blue-300 bg-blue-50 text-blue-700";
  if (s === "received") return "app-badge border-green-300 bg-green-50 text-green-700";
  if (s === "cancelled") return "app-badge border-red-300 bg-red-50 text-red-600";
  if (s === "partially_received") return "app-badge border-amber-300 bg-amber-50 text-amber-700";
  return "app-badge border-slate-300 bg-slate-100 text-slate-600";
};

export default function POTable({ onViewPO, onCreatePO, refreshKey }: Props) {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("order_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);

  const loadPOs = async () => {
    setLoading(true);
    try {
      const data = await listPurchaseOrders<PurchaseOrderListRow[]>();
      setPurchaseOrders(data);
    } catch {
      setPurchaseOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPOs(); }, [refreshKey]);

  const filtered = useMemo(() => {
    let result = purchaseOrders;
    if (statusFilter) result = result.filter((po) => po.status === statusFilter);
    if (supplierSearch) {
      const q = supplierSearch.toLowerCase();
      result = result.filter((po) => po.supplier_name.toLowerCase().includes(q));
    }
    return result;
  }, [purchaseOrders, statusFilter, supplierSearch]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: string | number = a[sortField] ?? "";
      let vb: string | number = b[sortField] ?? "";
      if (sortField === "total") { va = Number(va); vb = Number(vb); }
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => { setPage(0); }, [statusFilter, supplierSearch, pageSize]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="inline h-3.5 w-3.5" /> : <ChevronDown className="inline h-3.5 w-3.5" />;
  };

  const statuses = [...new Set(purchaseOrders.map((po) => po.status))].sort();

  const handleSend = async (po: PurchaseOrderListRow) => {
    try { await sendPurchaseOrder(po.id); await loadPOs(); } catch { /* ignore */ }
  };

  const handleDelete = async (po: PurchaseOrderListRow) => {
    if (!window.confirm(`Delete ${po.po_number}?`)) return;
    try { await deletePurchaseOrder(po.id); await loadPOs(); } catch { /* ignore */ }
  };

  return (
    <div className="app-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b p-4">
        <input className="app-input" style={{ maxWidth: 220 }} placeholder="Search supplier..." value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
        <select className="app-select" style={{ maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="ml-auto">
          <button className="app-button" onClick={onCreatePO}>+ New PO</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="p-8 text-center text-sm text-muted">Loading purchase orders...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("po_number")}>PO # <SortIndicator field="po_number" /></th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("supplier_name")}>Supplier <SortIndicator field="supplier_name" /></th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("order_date")}>Order Date <SortIndicator field="order_date" /></th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("status")}>Status <SortIndicator field="status" /></th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("total")}>Total <SortIndicator field="total" /></th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((po) => (
                <tr key={po.id} className="app-table-row border-t">
                  <td className="px-4 py-3">
                    <button
                      className="font-semibold text-primary hover:underline"
                      onClick={() => onViewPO(po)}
                      type="button"
                    >
                      {po.po_number}
                    </button>
                  </td>
                  <td className="px-4 py-3">{po.supplier_name}</td>
                  <td className="px-4 py-3 text-muted">{po.order_date}</td>
                  <td className="px-4 py-3"><span className={statusBadge(po.status)}>{po.status.replace("_", " ")}</span></td>
                  <td className="px-4 py-3 font-medium">${Number(po.total).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button className="app-button-ghost" title="View Details" onClick={() => onViewPO(po)} type="button"><Eye className="h-4 w-4" /></button>
                      {po.status === "DRAFT" && <button className="app-button-ghost" title="Send" onClick={() => handleSend(po)}><Send className="h-4 w-4" /></button>}
                      {po.status === "DRAFT" && <button className="app-button-ghost text-danger" title="Delete" onClick={() => handleDelete(po)}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted">No purchase orders found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted">
        <div className="flex items-center gap-2">
          <span>Rows:</span>
          <select className="app-select" style={{ width: 64 }} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span>{sorted.length} total</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="app-button-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></button>
          <span>Page {page + 1} of {totalPages}</span>
          <button className="app-button-ghost" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
