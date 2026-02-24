import { ReactNode } from "react";
import { Plus } from "lucide-react";

type OrdersViewProps = {
  onCreate: () => void;
  children: ReactNode;
};

export default function OrdersView({ onCreate, children }: OrdersViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Orders</h2>
        <button className="app-button" onClick={onCreate}>
          <Plus className="h-4 w-4" /> New Order
        </button>
      </div>
      {children}
    </div>
  );
}
