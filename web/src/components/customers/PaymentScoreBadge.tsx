const SCORE_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  good:      { bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-700 dark:text-green-400", dot: "bg-green-500", label: "Good" },
  average:   { bg: "bg-blue-50 dark:bg-blue-900/20",   text: "text-blue-700 dark:text-blue-400",   dot: "bg-blue-500",  label: "Average" },
  slow:      { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500", label: "Slow" },
  "at-risk": { bg: "bg-red-50 dark:bg-red-900/20",     text: "text-red-700 dark:text-red-400",     dot: "bg-red-500",   label: "At Risk" },
};

type Props = { score: string };

export default function PaymentScoreBadge({ score }: Props) {
  const s = SCORE_STYLES[score] || SCORE_STYLES.good;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
