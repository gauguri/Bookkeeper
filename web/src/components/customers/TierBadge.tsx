const TIER_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  PLATINUM: { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300", ring: "ring-violet-400/30" },
  GOLD:     { bg: "bg-amber-100 dark:bg-amber-900/30",   text: "text-amber-700 dark:text-amber-300",   ring: "ring-amber-400/30" },
  SILVER:   { bg: "bg-gray-200 dark:bg-gray-700/50",     text: "text-gray-700 dark:text-gray-300",     ring: "ring-gray-400/30" },
  BRONZE:   { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", ring: "ring-orange-400/30" },
  STANDARD: { bg: "bg-blue-50 dark:bg-blue-900/20",      text: "text-blue-600 dark:text-blue-400",     ring: "ring-blue-400/20" },
};

type Props = { tier: string; size?: "sm" | "md" };

export default function TierBadge({ tier, size = "sm" }: Props) {
  const key = (tier || "STANDARD").toUpperCase();
  const s = TIER_STYLES[key] || TIER_STYLES.STANDARD;
  const sizeClass = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide ring-1 ${s.bg} ${s.text} ${s.ring} ${sizeClass}`}>
      {key}
    </span>
  );
}
