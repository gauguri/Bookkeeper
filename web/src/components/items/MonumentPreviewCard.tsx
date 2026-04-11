import { useState, type MouseEvent } from "react";

type MonumentPreviewProps = {
  item: {
    color?: string | null;
    monument_type?: string | null;
    shape?: string | null;
    finish?: string | null;
    category?: string | null;
    description?: string | null;
    sales_description?: string | null;
    lr_feet?: number | null;
    lr_inches?: number | null;
    fb_feet?: number | null;
    fb_inches?: number | null;
    tb_feet?: number | null;
    tb_inches?: number | null;
  };
};

const COLOR_MAP: Array<{ match: string[]; top: string; left: string; right: string; accent: string }> = [
  { match: ["black", "dark", "jet"], top: "#5b6070", left: "#2c303d", right: "#444b5d", accent: "#aeb8cb" },
  { match: ["grey", "gray", "silver"], top: "#b8bec6", left: "#7f8793", right: "#9ca5b1", accent: "#eef2f6" },
  { match: ["white", "light"], top: "#ede8e1", left: "#c9c0b4", right: "#ddd4c8", accent: "#fffdf7" },
  { match: ["red", "rainbow", "aurora"], top: "#824e53", left: "#553238", right: "#6f4349", accent: "#d8a1aa" },
  { match: ["blue"], top: "#7390ad", left: "#4f6684", right: "#627c9b", accent: "#d3e1f0" },
  { match: ["brown"], top: "#8a6b57", left: "#5d4538", right: "#745747", accent: "#d8c0af" },
  { match: ["green"], top: "#7d9184", left: "#55645c", right: "#677970", accent: "#ced9d2" },
];

function stonePalette(color: string | null | undefined) {
  const normalized = (color || "").toLowerCase();
  return COLOR_MAP.find((entry) => entry.match.some((token) => normalized.includes(token)))
    ?? { top: "#a79f98", left: "#746d67", right: "#8a837c", accent: "#f1ebe3" };
}

function toFeet(feet?: number | null, inches?: number | null) {
  return Number(feet || 0) + (Number(inches || 0) / 12);
}

function finishLabel(finish: string | null | undefined) {
  const normalized = (finish || "").toUpperCase();
  if (!normalized) return "Standard stone finish";
  if (normalized.includes("ALL POL")) return "All polished faces";
  if (normalized.includes("POL MRG")) return "Polished margin finish";
  if (normalized.includes("PT SS")) return "Polished top / sawn sides";
  if (normalized.includes("SPECIAL")) return "Special finish treatment";
  return normalized;
}

export default function MonumentPreviewCard({ item }: MonumentPreviewProps) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const widthFeet = Math.max(toFeet(item.lr_feet, item.lr_inches), 0.5);
  const depthFeet = Math.max(toFeet(item.fb_feet, item.fb_inches), 0.4);
  const heightFeet = Math.max(toFeet(item.tb_feet, item.tb_inches), 0.2);
  const palette = stonePalette(item.color);
  const shape = (item.shape || item.monument_type || "stone").toUpperCase();
  const finish = (item.finish || "").toUpperCase();
  const description = `${item.description || ""} ${item.sales_description || ""}`.toUpperCase();

  const widthPx = 130 + Math.min(widthFeet * 44, 180);
  const depthPx = 34 + Math.min(depthFeet * 26, 90);
  const heightPx = 14 + Math.min(heightFeet * 46, 72);

  const x = 160;
  const y = 165;

  const topPoints = [
    `${x},${y}`,
    `${x + widthPx},${y}`,
    `${x + widthPx + depthPx},${y - depthPx * 0.58}`,
    `${x + depthPx},${y - depthPx * 0.58}`,
  ].join(" ");

  const leftPoints = [
    `${x},${y}`,
    `${x + depthPx},${y - depthPx * 0.58}`,
    `${x + depthPx},${y - depthPx * 0.58 + heightPx}`,
    `${x},${y + heightPx}`,
  ].join(" ");

  const rightPoints = [
    `${x + widthPx},${y}`,
    `${x + widthPx + depthPx},${y - depthPx * 0.58}`,
    `${x + widthPx + depthPx},${y - depthPx * 0.58 + heightPx}`,
    `${x + widthPx},${y + heightPx}`,
  ].join(" ");

  const frontPoints = [
    `${x},${y}`,
    `${x + widthPx},${y}`,
    `${x + widthPx},${y + heightPx}`,
    `${x},${y + heightPx}`,
  ].join(" ");

  const polishedMargin = finish.includes("POL MRG") || description.includes("POL MARGIN");
  const beveled = description.includes("BRP") || description.includes("BEVEL");
  const allPolished = finish.includes("ALL POL");
  const sawnSides = finish.includes("SS");
  const specialShape = shape.includes("SPECIAL") || description.includes("SPECIAL");
  const flatShape = shape.includes("FLAT") || shape.includes("BASE") || shape.includes("MARKER");

  const handlePointerMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    setTilt({
      x: (0.5 - py) * 18,
      y: (px - 0.5) * 24,
    });
  };

  const resetTilt = () => setTilt({ x: 0, y: 0 });
  const monumentTransform = `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`;

  return (
    <div className="mt-5 overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(135deg,#eef3fb_0%,#f7f4ef_58%,#efe9df_100%)]">
      <div className="grid gap-0 lg:grid-cols-[1.35fr_0.65fr]">
        <div
          className="relative min-h-[320px] overflow-hidden px-6 py-6"
          onMouseMove={handlePointerMove}
          onMouseLeave={resetTilt}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.9),transparent_35%),radial-gradient(circle_at_80%_25%,rgba(255,255,255,0.5),transparent_28%)]" />
          <svg viewBox="0 0 640 320" className="relative z-10 h-full w-full">
            <defs>
              <linearGradient id="pedestal" x1="0%" x2="100%">
                <stop offset="0%" stopColor="#d8deea" />
                <stop offset="100%" stopColor="#c1cad9" />
              </linearGradient>
              <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
                <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="#6f7785" floodOpacity="0.22" />
              </filter>
            </defs>

            <ellipse cx="326" cy="252" rx="190" ry="34" fill="rgba(67,85,111,0.14)" />
            <path d="M120 248 H500 L546 228 H164 Z" fill="url(#pedestal)" />
            <path d="M164 228 H546 L500 214 H120 Z" fill="#edf2f8" />

            <foreignObject x="70" y="32" width="500" height="230">
              <div
                className="h-full w-full origin-center transition-transform duration-150 ease-out"
                style={{ transform: monumentTransform, transformStyle: "preserve-3d" }}
              >
                <svg viewBox="0 0 640 320" className="h-full w-full overflow-visible">
                  <g filter="url(#shadow)">
                    <polygon points={frontPoints} fill={allPolished ? palette.accent : palette.left} />
                    <polygon points={leftPoints} fill={sawnSides && !allPolished ? "#6f767d" : palette.left} />
                    <polygon points={rightPoints} fill={allPolished ? palette.accent : palette.right} />
                    <polygon points={topPoints} fill={palette.top} />

                    {polishedMargin ? (
                      <polygon
                        points={[
                          `${x + 10},${y + 3}`,
                          `${x + widthPx - 10},${y + 3}`,
                          `${x + widthPx + depthPx - 10},${y - depthPx * 0.58 + 3}`,
                          `${x + depthPx + 10},${y - depthPx * 0.58 + 3}`,
                        ].join(" ")}
                        fill="none"
                        stroke={palette.accent}
                        strokeWidth="8"
                        strokeLinejoin="round"
                        opacity="0.95"
                      />
                    ) : null}

                    {beveled ? (
                      <>
                        <line x1={x + 14} y1={y + 4} x2={x + depthPx + 14} y2={y - depthPx * 0.58 + 4} stroke={palette.accent} strokeWidth="3" opacity="0.85" />
                        <line x1={x + widthPx - 14} y1={y + 4} x2={x + widthPx + depthPx - 14} y2={y - depthPx * 0.58 + 4} stroke={palette.accent} strokeWidth="3" opacity="0.85" />
                      </>
                    ) : null}

                    {specialShape ? (
                      <path
                        d={`M ${x + widthPx * 0.18} ${y + heightPx * 0.12} Q ${x + widthPx * 0.5} ${y - 18} ${x + widthPx * 0.82} ${y + heightPx * 0.12}`}
                        stroke={palette.accent}
                        strokeWidth="4"
                        fill="none"
                        opacity="0.85"
                      />
                    ) : null}

                    {!flatShape ? (
                      <path
                        d={`M ${x} ${y + heightPx * 0.4} Q ${x + widthPx * 0.08} ${y + heightPx * 0.16} ${x + widthPx * 0.16} ${y + heightPx * 0.06}`}
                        stroke={palette.accent}
                        strokeWidth="4"
                        fill="none"
                        opacity="0.7"
                      />
                    ) : null}
                  </g>
                </svg>
              </div>
            </foreignObject>

            <text x="320" y="296" textAnchor="middle" className="fill-slate-600 text-[12px] font-semibold tracking-[0.18em] uppercase">
              Concept Preview
            </text>
          </svg>
        </div>

        <div className="border-t border-border/60 bg-white/65 px-5 py-5 lg:border-l lg:border-t-0">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">3D Preview</p>
          <h3 className="mt-2 text-lg font-semibold">Rule-Based Monument Render</h3>
          <p className="mt-2 text-sm text-muted">
            Dimensions, color, shape, finish, and description are being translated into an approximate isometric stone preview.
          </p>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-border/60 bg-white/80 px-3 py-3 text-sm">
              <p className="text-xs text-muted">Overall size</p>
              <p className="mt-1 font-medium">
                {`${item.lr_feet ?? 0}-${item.lr_inches ?? 0} x ${item.fb_feet ?? 0}-${item.fb_inches ?? 0} x ${item.tb_feet ?? 0}-${item.tb_inches ?? 0}`}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/80 px-3 py-3 text-sm">
              <p className="text-xs text-muted">Stone finish</p>
              <p className="mt-1 font-medium">{finishLabel(item.finish)}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-white/80 px-3 py-3 text-sm">
              <p className="text-xs text-muted">Shape interpretation</p>
              <p className="mt-1 font-medium">{shape || "Standard block form"}</p>
            </div>
            <div className="rounded-2xl border border-dashed border-border/70 bg-white/55 px-3 py-3 text-xs text-muted">
              This is a visualization preview, not an exact CAD or shop drawing.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
