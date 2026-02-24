import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

import { apiFetch } from "../../../api";
import { SalesAccount } from "../../../components/sales/types";

export default function AccountDetailPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const [account, setAccount] = useState<SalesAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountId) {
      setError("Account id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    apiFetch<SalesAccount>(`/sales/accounts/${accountId}`)
      .then(setAccount)
      .catch((err: Error) => setError(err.message || "Failed to load account."))
      .finally(() => setLoading(false));
  }, [accountId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Account</h2>
          <p className="text-sm text-muted">Sales account details.</p>
        </div>
        <Link className="app-button-secondary" to="/sales/management?section=accounts">
          Back to accounts
        </Link>
      </div>

      {loading && <div className="app-card p-4 text-sm text-muted">Loading account…</div>}
      {error && <div className="app-card border border-red-500/40 p-4 text-sm text-red-300">{error}</div>}

      {!loading && !error && account && (
        <section className="app-card p-6">
          <h3 className="text-xl font-semibold">{account.name}</h3>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted">Industry</dt>
              <dd>{account.industry || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Phone</dt>
              <dd>{account.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Website</dt>
              <dd>{account.website || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Shipping address</dt>
              <dd>{account.shipping_address || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Last updated</dt>
              <dd>{account.updated_at ? new Date(account.updated_at).toLocaleString() : "—"}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
