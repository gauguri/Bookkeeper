import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { apiFetch } from "../api";

type Supplier = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  created_at: string;
  updated_at: string;
};

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  address: ""
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!search) {
      return suppliers;
    }
    return suppliers.filter((supplier) => supplier.name.toLowerCase().includes(search.toLowerCase()));
  }, [suppliers, search]);

  const loadSuppliers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<Supplier[]>(`/suppliers?search=${encodeURIComponent(search)}`);
      setSuppliers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    setError("");
    try {
      if (editingId) {
        const updated = await apiFetch<Supplier>(`/suppliers/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form)
        });
        setSuppliers((prev) => prev.map((supplier) => (supplier.id === editingId ? updated : supplier)));
      } else {
        const created = await apiFetch<Supplier>("/suppliers", {
          method: "POST",
          body: JSON.stringify(form)
        });
        setSuppliers((prev) => [created, ...prev]);
      }
      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? ""
    });
  };

  const deleteSupplier = async (supplierId: number) => {
    try {
      await apiFetch(`/suppliers/${supplierId}`, { method: "DELETE" });
      setSuppliers((prev) => prev.filter((supplier) => supplier.id !== supplierId));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Suppliers</p>
          <h1 className="text-3xl font-semibold">Supplier directory</h1>
          <p className="text-muted">Maintain vendor contacts and purchasing partners.</p>
        </div>
        <button className="app-button" onClick={() => document.getElementById("supplier-form")?.scrollIntoView()}>
          <Plus className="h-4 w-4" /> New supplier
        </button>
      </div>

      <div className="app-card p-6">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-surface/95 pb-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="app-input w-60"
              placeholder="Search suppliers"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="app-button-secondary" onClick={loadSuppliers} disabled={loading}>
              Search
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-widest text-muted">
              <tr>
                <th className="py-3">Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((supplier) => (
                <tr key={supplier.id} className="app-table-row border-t">
                  <td className="py-3 font-medium text-foreground">{supplier.name}</td>
                  <td className="text-muted">{supplier.email ?? "-"}</td>
                  <td className="text-muted">{supplier.phone ?? "-"}</td>
                  <td className="text-muted">{supplier.address ?? "-"}</td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <button className="app-button-ghost" onClick={() => startEdit(supplier)}>
                        Edit
                      </button>
                      <button className="app-button-ghost text-danger" onClick={() => deleteSupplier(supplier.id)}>
                        Delete
                      </button>
                      <button className="app-button-ghost" aria-label="More actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="h-14 w-14 rounded-2xl bg-secondary" />
                      <p className="font-semibold">No suppliers found</p>
                      <p className="text-sm text-muted">Create a supplier to start tracking vendor costs.</p>
                      <button
                        className="app-button"
                        onClick={() => document.getElementById("supplier-form")?.scrollIntoView()}
                      >
                        Create supplier
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div id="supplier-form" className="app-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{editingId ? "Edit supplier" : "New supplier"}</h2>
          <span className="app-badge border-primary/30 bg-primary/10 text-primary">Vendor profile</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <input
            className="app-input"
            placeholder="Name *"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
          <input
            className="app-input"
            placeholder="Phone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          <input
            className="app-input md:col-span-2"
            placeholder="Address"
            value={form.address}
            onChange={(event) => setForm({ ...form, address: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted">Last updated {editingId ? "recently" : "—"}</div>
          <div className="flex items-center gap-2">
            {editingId && (
              <button
                className="app-button-secondary"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            )}
            <button className="app-button" onClick={handleSubmit}>
              {editingId ? "Save changes" : "Create supplier"}
            </button>
          </div>
        </div>
      </div>

      <button
        className="fixed bottom-8 right-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-1"
        onClick={() => document.getElementById("supplier-form")?.scrollIntoView({ behavior: "smooth" })}
      >
        <Plus className="h-4 w-4" /> Create
      </button>
    </section>
  );
}
