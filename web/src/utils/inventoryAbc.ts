export type AbcClass = "A" | "B" | "C";

export type InventoryAbcInput = {
  id: number;
  item: string;
  on_hand: number;
  landed_unit_cost?: number | null;
};

export type InventoryAbcRow<T extends InventoryAbcInput> = T & {
  extended_value: number;
  cumulative_value: number;
  cumulative_pct: number;
  abc_class: AbcClass;
  missing_cost: boolean;
  landed_cost: number;
};

export function computeExtendedValue(item: Pick<InventoryAbcInput, "on_hand" | "landed_unit_cost">): {
  on_hand_qty: number;
  landed_unit_cost: number;
  extended_value: number;
  missing_cost: boolean;
} {
  const onHandQty = Number(item.on_hand);
  const normalizedOnHand = Number.isFinite(onHandQty) ? onHandQty : 0;
  const rawUnitCost = Number(item.landed_unit_cost);
  const hasCost = Number.isFinite(rawUnitCost);
  const landedUnitCost = hasCost ? rawUnitCost : 0;
  const extendedValue = normalizedOnHand * landedUnitCost;

  return {
    on_hand_qty: normalizedOnHand,
    landed_unit_cost: landedUnitCost,
    extended_value: Number.isFinite(extendedValue) ? extendedValue : 0,
    missing_cost: !hasCost,
  };
}

export function computeAbcClassification<T extends InventoryAbcInput>(items: T[]): InventoryAbcRow<T>[] {
  const ranked = items
    .map((item) => {
      const computed = computeExtendedValue(item);
      return {
        ...item,
        landed_cost: computed.landed_unit_cost,
        extended_value: computed.extended_value,
        missing_cost: computed.missing_cost,
      };
    })
    .sort((a, b) => b.extended_value - a.extended_value);

  const totalInventoryValue = ranked.reduce((sum, item) => sum + item.extended_value, 0);
  let cumulativeValue = 0;

  return ranked.map((item) => {
    cumulativeValue += item.extended_value;
    const cumulativePct = totalInventoryValue > 0 ? cumulativeValue / totalInventoryValue : 0;
    const abcClass: AbcClass = cumulativePct <= 0.8 ? "A" : cumulativePct <= 0.95 ? "B" : "C";

    return {
      ...item,
      cumulative_value: cumulativeValue,
      cumulative_pct: cumulativePct,
      abc_class: abcClass,
    };
  });
}

export function getAbcColor(abcClass: AbcClass): string {
  if (abcClass === "A") return "#2563eb";
  if (abcClass === "B") return "#f59e0b";
  return "#16a34a";
}
