import { formatCurrency, formatPercent } from "../../utils/formatters";

type LineItem = {
  label: string;
  value: number;
  indent?: number;
  bold?: boolean;
  isSubtotal?: boolean;
  isTotal?: boolean;
};

type Section = {
  title: string;
  items: LineItem[];
  total?: number;
};

type Props = {
  title: string;
  sections: Section[];
  columns?: { label: string; key: string }[];
};

export default function FinancialStatement({ title, sections }: Props) {
  return (
    <div className="app-card overflow-hidden">
      <div className="border-b px-6 py-4">
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <div className="divide-y">
        {sections.map((section, si) => (
          <div key={si} className="px-6 py-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
              {section.title}
            </h4>
            <div className="space-y-1">
              {section.items.map((item, ii) => (
                <div
                  key={ii}
                  className={`flex items-center justify-between py-1 ${
                    item.isTotal || item.isSubtotal
                      ? "border-t border-gray-200 pt-2 dark:border-gray-700"
                      : ""
                  }`}
                  style={{ paddingLeft: (item.indent || 0) * 20 }}
                >
                  <span
                    className={`text-sm ${
                      item.bold || item.isTotal
                        ? "font-bold"
                        : item.isSubtotal
                          ? "font-semibold"
                          : "text-muted"
                    }`}
                  >
                    {item.label}
                  </span>
                  <span
                    className={`tabular-nums text-sm ${
                      item.bold || item.isTotal ? "font-bold" : item.isSubtotal ? "font-semibold" : ""
                    } ${item.value < 0 ? "text-red-600" : ""}`}
                  >
                    {formatCurrency(item.value, true)}
                  </span>
                </div>
              ))}
            </div>
            {section.total != null && (
              <div className="mt-2 flex items-center justify-between border-t-2 border-gray-800 pt-2 dark:border-gray-300">
                <span className="text-sm font-bold">Total {section.title}</span>
                <span className="text-sm font-bold tabular-nums">
                  {formatCurrency(section.total, true)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
