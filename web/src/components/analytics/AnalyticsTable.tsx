import { useState } from "react";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";

type Column<T> = {
  key: string;
  label: string;
  format?: (value: any, row: T) => string;
  align?: "left" | "right" | "center";
  sparkline?: boolean;
};

type Props<T> = {
  columns: Column<T>[];
  data: T[];
  title?: string;
  sortable?: boolean;
  onExport?: () => void;
};

function MiniSparkline({ values }: { values: number[] }) {
  if (!values?.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 60;
  const h = 18;
  const step = w / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${i * step},${h - ((v - min) / range) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="inline-block opacity-60">
      <polyline fill="none" stroke="#3b82f6" strokeWidth="1.5" points={points} />
    </svg>
  );
}

export default function AnalyticsTable<T extends Record<string, any>>({
  columns,
  data,
  title,
  sortable = true,
  onExport,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    if (!sortable) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const diff = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? diff : -diff;
      })
    : data;

  return (
    <div className="app-card overflow-hidden">
      {(title || onExport) && (
        <div className="flex items-center justify-between border-b px-4 py-3">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {onExport && (
            <button onClick={onExport} className="app-button-ghost flex items-center gap-1 text-xs">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 dark:bg-gray-800/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted ${
                    col.align === "right" ? "text-right" : "text-left"
                  } ${sortable ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key &&
                      (sortDir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="app-table-row border-b last:border-0">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.sparkline && Array.isArray(row[col.key]) ? (
                      <MiniSparkline values={row[col.key]} />
                    ) : col.format ? (
                      col.format(row[col.key], row)
                    ) : (
                      String(row[col.key] ?? "—")
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted">
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
