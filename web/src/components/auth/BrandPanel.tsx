import { APP_NAME } from "../../branding";

export function BrandPanel() {
  return (
    <aside className="bedrock-brand-panel relative hidden min-h-[720px] overflow-hidden rounded-[2rem] border lg:flex lg:flex-col lg:justify-between">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-30" viewBox="0 0 920 920" fill="none">
        <path d="M-20 140C170 120 250 190 400 160C560 130 700 80 940 110" stroke="url(#layerA)" strokeWidth="2" />
        <path d="M-20 360C130 340 230 300 390 330C540 360 650 290 940 330" stroke="url(#layerA)" strokeWidth="1.8" />
        <path d="M-20 620C150 590 250 650 420 620C580 590 700 560 940 590" stroke="url(#layerA)" strokeWidth="1.8" />
        <path d="M220 0L210 170L280 280L230 450L320 610L280 920" stroke="url(#fracture)" strokeWidth="1.2" />
        <path d="M720 0L760 180L690 320L780 520L700 760L740 920" stroke="url(#fracture)" strokeWidth="1.2" />
        <defs>
          <linearGradient id="layerA" x1="0" y1="0" x2="920" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4A6CF7" stopOpacity="0.35" />
            <stop offset="1" stopColor="#2F8F9D" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="fracture" x1="0" y1="0" x2="0" y2="920" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F2F4F7" stopOpacity="0.28" />
            <stop offset="1" stopColor="#F2F4F7" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <div className="relative z-10 max-w-lg space-y-5 p-12">
        <p className="text-xs font-semibold uppercase tracking-[0.36em] text-sky-900/75">{APP_NAME} Guided Access</p>
        <h2 className="text-5xl font-semibold leading-tight text-slate-900">Built on Strength. Engineered for Scale.</h2>
        <p className="text-lg leading-relaxed text-slate-700">
          Bring finance, operations, and commercial workflows into one infrastructure-grade control plane.
        </p>
        <div className="inline-flex rounded-xl border border-sky-200 bg-white/75 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm">
          ENTERPRISE READINESS
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-3 gap-3 p-12 pt-0 text-xs text-slate-700">
        <div className="rounded-xl border border-slate-300/70 bg-white/60 p-3 backdrop-blur-sm">Secure Identity</div>
        <div className="rounded-xl border border-slate-300/70 bg-white/60 p-3 backdrop-blur-sm">Operational Control</div>
        <div className="rounded-xl border border-slate-300/70 bg-white/60 p-3 backdrop-blur-sm">Auditable Reliability</div>
      </div>
    </aside>
  );
}
