import { CheckCircle2, Clock, XCircle, MinusCircle } from "lucide-react";

type ApprovalStep = {
  step: string;
  status: "approved" | "pending" | "rejected" | "skipped";
  approver: string;
  date?: string;
  notes?: string;
};

type Props = { steps: ApprovalStep[] };

function StepIcon({ status }: { status: ApprovalStep["status"] }) {
  if (status === "approved") return <CheckCircle2 className="h-5 w-5" style={{ color: "var(--po-success)" }} />;
  if (status === "pending") return <Clock className="h-5 w-5" style={{ color: "var(--po-text-dim)" }} />;
  if (status === "rejected") return <XCircle className="h-5 w-5" style={{ color: "var(--po-danger)" }} />;
  return <MinusCircle className="h-5 w-5" style={{ color: "var(--po-text-dim)" }} />;
}

export default function ApprovalTimeline({ steps }: Props) {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const dateStr = step.date ? new Date(step.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

        return (
          <div key={i} className="flex gap-3">
            {/* Timeline track */}
            <div className="flex flex-col items-center">
              <StepIcon status={step.status} />
              {!isLast && (
                <div className="w-0.5 flex-1 my-0.5" style={{ background: step.status === "approved" ? "var(--po-success)" : "var(--po-border)" }} />
              )}
            </div>

            {/* Content */}
            <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
              <p className="text-sm font-medium" style={{ color: step.status === "pending" ? "var(--po-text-dim)" : "var(--po-text)" }}>
                {step.step}
              </p>
              {step.approver && (
                <p className="text-xs" style={{ color: "var(--po-text-dim)" }}>{step.approver}</p>
              )}
              {dateStr && (
                <p className="text-xs" style={{ color: "var(--po-text-dim)" }}>{dateStr}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
