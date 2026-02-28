import { COMPLIANCE_RULES } from "../../data/poMockData";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CheckCircle2, XCircle } from "lucide-react";

export default function ComplianceAudit() {
  const totalPassed = COMPLIANCE_RULES.reduce((s, r) => s + r.passed, 0);
  const totalFailed = COMPLIANCE_RULES.reduce((s, r) => s + r.failed, 0);
  const overallRate = ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1);

  const donutData = [
    { name: "Passed", value: totalPassed },
    { name: "Failed", value: totalFailed },
  ];

  return (
    <div className="app-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Compliance & Audit</h3>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Donut */}
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
              <span className="text-[10px] uppercase text-muted">Compliant</span>
            </div>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" /> Passed</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Failed</span>
          </div>
        </div>

        {/* Rules table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="py-2">Rule</th>
                <th className="py-2">Category</th>
                <th className="py-2 text-center">Passed</th>
                <th className="py-2 text-center">Failed</th>
                <th className="py-2 text-center">Rate</th>
              </tr>
            </thead>
            <tbody>
              {COMPLIANCE_RULES.map((rule) => {
                const rate = ((rule.passed / rule.total) * 100).toFixed(0);
                const isGood = Number(rate) >= 95;
                return (
                  <tr key={rule.id} className="border-t">
                    <td className="py-2 font-medium">{rule.rule}</td>
                    <td className="py-2"><span className="app-badge border-primary/30 bg-primary/10 text-primary">{rule.category}</span></td>
                    <td className="py-2 text-center text-green-600">{rule.passed}</td>
                    <td className="py-2 text-center text-red-500">{rule.failed}</td>
                    <td className="py-2 text-center">
                      <span className={`inline-flex items-center gap-1 ${isGood ? "text-green-600" : "text-amber-500"}`}>
                        {isGood ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {rate}%
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
