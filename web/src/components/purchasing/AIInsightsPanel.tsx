import { Lightbulb, Sparkles } from "lucide-react";
import type { ProcurementInsight } from "./types";

type AIInsightsPanelProps = {
  insights: ProcurementInsight[];
  loading?: boolean;
};

function InsightCard({ insight }: { insight: ProcurementInsight }) {
  return (
    <div className="app-card flex flex-col gap-3 p-4 transition-shadow hover:shadow-lg">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-xs font-medium uppercase tracking-wider text-primary">{insight.category}</span>
      </div>
      <h4 className="text-sm font-semibold">{insight.title}</h4>
      <p className="text-xs leading-relaxed text-muted">{insight.description}</p>
      <div className="flex items-start gap-2 rounded-lg border border-primary/10 bg-primary/5 p-2.5">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted">{insight.recommendation}</p>
      </div>
    </div>
  );
}

export default function AIInsightsPanel({ insights, loading = false }: AIInsightsPanelProps) {
  if (loading) {
    return (
      <div>
        <h3 className="mb-1 text-sm font-semibold">Procurement Insights</h3>
        <p className="mb-4 text-xs text-muted">Live observations from current procurement data.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="app-card h-48 animate-pulse bg-secondary" />
          ))}
        </div>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-1 text-sm font-semibold">Procurement Insights</h3>
        <p className="text-xs text-muted">No live procurement observations are available yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">Procurement Insights</h3>
      <p className="mb-4 text-xs text-muted">Live observations from current procurement data. No predictive model is configured on this page.</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}
