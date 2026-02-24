import { ReactNode } from "react";
import { Plus } from "lucide-react";

type QuotesViewProps = {
  onCreate: () => void;
  children: ReactNode;
};

export default function QuotesView({ onCreate, children }: QuotesViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Quotes</h2>
        <button className="app-button" onClick={onCreate}>
          <Plus className="h-4 w-4" /> New Quote
        </button>
      </div>
      {children}
    </div>
  );
}
