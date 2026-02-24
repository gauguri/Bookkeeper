import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

import { apiFetch } from "../../../api";
import { SalesOpportunity } from "../../../components/sales/types";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value || 0);

export default function OpportunityDetailPage() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const [opportunity, setOpportunity] = useState<SalesOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!opportunityId) {
      setError("Opportunity id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    apiFetch<SalesOpportunity>(`/sales/opportunities/${opportunityId}`)
      .then(setOpportunity)
      .catch((err: Error) => setError(err.message || "Failed to load opportunity."))
      .finally(() => setLoading(false));
  }, [opportunityId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Opportunity</h2>
          <p className="text-sm text-muted">Pipeline opportunity details.</p>
        </div>
        <Link className="app-button-secondary" to="/sales/management?section=opportunities">
          Back to opportunities
        </Link>
      </div>

      {loading && <div className="app-card p-4 text-sm text-muted">Loading opportunity…</div>}
      {error && <div className="app-card border border-red-500/40 p-4 text-sm text-red-300">{error}</div>}

      {!loading && !error && opportunity && (
        <section className="app-card p-6">
          <h3 className="text-xl font-semibold">{opportunity.name}</h3>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-muted">Stage</dt>
              <dd>{opportunity.stage}</dd>
            </div>
            <div>
              <dt className="text-muted">Amount estimate</dt>
              <dd>{formatCurrency(opportunity.amount_estimate)}</dd>
            </div>
            <div>
              <dt className="text-muted">Probability</dt>
              <dd>{opportunity.probability}%</dd>
            </div>
            <div>
              <dt className="text-muted">Expected close date</dt>
              <dd>{opportunity.expected_close_date ? new Date(opportunity.expected_close_date).toLocaleDateString() : "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Source</dt>
              <dd>{opportunity.source || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Next step</dt>
              <dd>{opportunity.next_step || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted">Last updated</dt>
              <dd>{opportunity.updated_at ? new Date(opportunity.updated_at).toLocaleString() : "—"}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
