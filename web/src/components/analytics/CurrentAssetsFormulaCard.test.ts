import { describe, expect, it } from "vitest";
import { currentAssetsFormulaSum } from "./CurrentAssetsFormulaCard";

describe("CurrentAssetsFormulaCard", () => {
  it("sums component nets for current assets", () => {
    const sum = currentAssetsFormulaSum([
      {
        component_name: "Cash",
        account_ids: [1],
        total_debits: 500,
        total_credits: 0,
        net: 500,
        normal_balance: "DEBIT",
      },
      {
        component_name: "Accounts Receivable",
        account_ids: [2],
        total_debits: 300,
        total_credits: 50,
        net: 250,
        normal_balance: "DEBIT",
      },
    ]);

    expect(sum).toBe(750);
  });
});
