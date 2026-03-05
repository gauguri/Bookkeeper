import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCurrency } from "../../utils/formatters";

export type CurrentAssetsComponent = {
  component_name: string;
  account_ids: number[];
  total_debits: number;
  total_credits: number;
  net: number;
  normal_balance: string;
};

type Props = {
  asOf?: string;
  currentAssetsTotal: number;
  components: CurrentAssetsComponent[];
};

export function currentAssetsFormulaSum(components: CurrentAssetsComponent[]): number {
  return Number(components.reduce((sum, item) => sum + item.net, 0).toFixed(2));
}

export default function CurrentAssetsFormulaCard({ asOf, currentAssetsTotal, components }: Props) {
  const formulaTerms = components.map((item) => item.component_name).join(" + ") || "—";

  return (
    <section className="app-card p-5">
      <h2 className="text-lg font-semibold">Current Assets – Calculation</h2>
      <p className="mt-1 text-sm text-muted">Current Assets = sum of current asset accounts (Debits − Credits)</p>
      <p className="mt-3 text-sm font-medium">Current Assets = {formulaTerms}</p>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted">
              <th className="px-2 py-2">Component (Account / Group)</th>
              <th className="px-2 py-2">Normal Balance</th>
              <th className="px-2 py-2 text-right">Debits</th>
              <th className="px-2 py-2 text-right">Credits</th>
              <th className="px-2 py-2 text-right">Net (Debits - Credits)</th>
              <th className="px-2 py-2">Drilldown</th>
            </tr>
          </thead>
          <tbody>
            {components.map((component) => {
              const isNegative = component.net < 0;
              const query = new URLSearchParams({
                account_ids: component.account_ids.join(","),
                ...(asOf ? { as_of: asOf } : {}),
              });

              return (
                <tr key={`${component.component_name}-${component.account_ids.join("-")}`} className="border-b">
                  <td className="px-2 py-2">{component.component_name}</td>
                  <td className="px-2 py-2">{component.normal_balance}</td>
                  <td className="px-2 py-2 text-right">{formatCurrency(component.total_debits)}</td>
                  <td className="px-2 py-2 text-right">{formatCurrency(component.total_credits)}</td>
                  <td className={`px-2 py-2 text-right font-semibold ${isNegative ? "text-red-600" : ""}`}>
                    {formatCurrency(component.net)}
                    {isNegative ? (
                      <span
                        className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700"
                        title="Typically indicates payments posted without AR, reversed sign, or misclassification."
                      >
                        <AlertTriangle className="mr-1 h-3 w-3" /> Negative asset balance
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Link className="text-primary underline" to={`/accounting/gl/journals?${query.toString()}`}>
                      View ledger entries
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-base font-bold">Current Assets (Total) = {formatCurrency(currentAssetsTotal)}</p>
    </section>
  );
}
