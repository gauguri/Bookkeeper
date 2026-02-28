import { AI_INSIGHTS, AIInsight } from "../../data/poMockData";
import { TrendingUp, TrendingDown, Minus, Sparkles, Lightbulb } from "lucide-react";

function TrendIcon({ trend }: { trend: AIInsight["trend"] }) {
  if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-600" />;
  if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted" />;
}

function InsightCard({ insight }: { insight: AIInsight }) {
  return (
    <div className="app-card flex flex-col gap-3 p-4 transition-shadow hover:shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-xs font-medium uppercase tracking-wider text-primary">{insight.category}</span>
        </div>
        <TrendIcon trend={insight.trend} />
      </div>

      <h4 className="text-sm font-semibold">{insight.title}</h4>
      <p className="text-xs leading-relaxed text-muted">{insight.description}</p>

      {/* Confidence bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted">Confidence</span>
          <span className="font-semibold text-primary">{insight.confidence}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${insight.confidence}%` }} />
        </div>
      </div>

      {/* Recommendation */}
      <div className="flex items-start gap-2 rounded-lg border border-primary/10 bg-primary/5 p-2.5">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="text-xs leading-relaxed text-muted">{insight.recommendation}</p>
      </div>
    </div>
  );
}

export default function AIInsightsPanel() {
  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold">AI Predictive Insights</h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AI_INSIGHTS.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}
