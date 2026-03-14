import type { ProcurementKpiCard } from "./types";

type POKpiCardsProps = {
  cards: ProcurementKpiCard[];
  loading?: boolean;
};

function SkeletonCard() {
  return (
    <div className="app-card p-4">
      <div className="h-3 w-24 rounded bg-secondary" />
      <div className="mt-3 h-8 w-20 rounded bg-secondary" />
      <div className="mt-2 h-3 w-32 rounded bg-secondary" />
    </div>
  );
}

function KpiCard({ card }: { card: ProcurementKpiCard }) {
  return (
    <div className="app-card flex flex-col gap-2 p-4 transition-shadow hover:shadow-lg">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{card.label}</p>
      <p className="text-2xl font-bold">{card.display_value}</p>
      <p className="text-xs text-muted">{card.helper}</p>
    </div>
  );
}

export default function POKpiCards({ cards, loading = false }: POKpiCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <KpiCard key={card.key} card={card} />
      ))}
    </div>
  );
}
