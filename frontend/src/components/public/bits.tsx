import type { CSSProperties, ReactNode } from "react";
import { cx } from "../../utils/format";

/** "— SECTION" eyebrow used across the public site. */
export function Eyebrow({ children, dark, center }: { children: ReactNode; dark?: boolean; center?: boolean }) {
  return (
    <p className={cx("flex items-center gap-3 font-mono text-[12px] font-medium tracking-[0.16em] uppercase", dark ? "text-petrol-400" : "text-link", center && "justify-center")}>
      <span className="h-px w-7 bg-current opacity-70" aria-hidden />{children}
    </p>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx("mt-3 text-[42px] leading-[50px] max-md:text-[31px] max-md:leading-[39px] font-bold tracking-[-0.022em]", className)}>{children}</h2>;
}

/** Inline style for a staggered entrance / reveal delay. */
export const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
