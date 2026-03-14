import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CheckCircle2, XCircle } from "lucide-react";
import type { ProcurementComplianceRule } from "./types";

type ComplianceAuditProps = {
  rules: ProcurementComplianceRule[];
  loading?: boolean;
};

export default function ComplianceAudit({ rules, loading = false }: ComplianceAuditProps) {
  if (loading) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Compliance and Audit</h3>
        <div className="h-72 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="app-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Compliance and Audit</h3>
        <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted">
          No live procurement control checks are available yet.
        </div>
      </div>
    );
  }

  const totalPassed = rules.reduce((sum, rule) => sum + rule.passed, 0);
  const totalFailed = rules.reduce((sum, rule) => sum + rule.failed, 0);
  const overallRate = totalPassed + totalFailed > 0 ? ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1) : "0.0";
  const donutData = [
    { name: "Passed", value: totalPassed },
    { name: "Failed", value: totalFailed },
  ];

  return (
    <div className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Compliance and Audit</h3>
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-center">
          <div className="relative">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value" startAngle={90} endAngle={-270}>
                  <Cell fill="#22c55e" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold">{overallRate}%</span>
              <span className="text-[10px] uppercase text-muted">Passing</span>
            </div>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Passed</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Failed</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2">Rule</th>
                <th className="py-2 text-center">Passed</th>
                <th className="py-2 text-center">Failed</th>
                <th className="py-2 text-center">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const isGood = rule.rate_percent >= 95;
                return (
                  <tr key={rule.id} className="border-t">
                    <td className="py-2 font-medium">{rule.rule}</td>
                    <td className="py-2 text-center text-green-600">{rule.passed}</td>
                    <td className="py-2 text-center text-red-500">{rule.failed}</td>
                    <td className="py-2 text-center">
                      <span className={`inline-flex items-center gap-1 ${isGood ? "text-green-600" : "text-amber-500"}`}>
                        {isGood ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {rule.rate_percent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
