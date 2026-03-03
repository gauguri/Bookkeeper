import type { ReactNode } from "react";

type PageLayoutVariant = "standard" | "cockpit";

const variantClasses: Record<PageLayoutVariant, string> = {
  standard: "w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8",
  cockpit: "w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-10 2xl:px-14",
};

export default function PageLayout({ variant = "standard", children }: { variant?: PageLayoutVariant; children: ReactNode }) {
  return <div className={`flex w-full flex-col gap-8 ${variantClasses[variant]}`}>{children}</div>;
}
