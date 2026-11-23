import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, OctagonAlert, FlaskConical, Inbox, RotateCw } from "lucide-react";
import { cx } from "../../utils/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "inverse";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover border border-transparent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-hover",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-surface-hover",
  danger: "bg-[var(--bad-fg)] text-white border border-transparent hover:opacity-90",
  inverse: "bg-white/5 text-white border border-white/20 hover:bg-white/10",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }>(
  function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cx(
          "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm max-md:h-11",
          VARIANTS[variant], className)}
        {...rest}
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
        {children}
      </button>
    );
  });

export function Card({ title, subtitle, actions, children, className, bodyClass, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string }) {
  return (
    <section id={id} className={cx("bg-surface border border-line rounded-[var(--radius-card)] shadow-card min-w-0", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-base font-semibold leading-6 text-ink">{title}</h3>}
            {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cx("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "neu";
export function Pill({ tone = "neu", children, icon, className, title }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-[12px] font-medium leading-4 whitespace-nowrap", className)}
      style={{ color: `var(--${tone}-fg)`, background: `var(--${tone}-bg)`, borderColor: `var(--${tone}-bd)` }}>
      {icon}{children}
    </span>
  );
}

const SEV: Record<string, { tone: Tone; color: string }> = {
  Critical: { tone: "bad", color: "#B42F28" }, Major: { tone: "warn", color: "#D0622A" }, Routine: { tone: "neu", color: "#5B6B7B" },
};
export function SeverityPill({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-faint">—</span>;
  const s = SEV[value] ?? SEV.Routine;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 whitespace-nowrap">
      <span className="inline-block size-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
      {value}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = { Open: "info", "Under investigation": "warn", "Awaiting customer information": "warn", Closed: "neu" };
export function StatusPill({ value }: { value: string }) {
  return <Pill tone={STATUS_TONE[value] ?? "neu"}>{value}</Pill>;
}

export function Banner({ tone = "info", title, children, className, action }: { tone?: Tone | "demo"; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const t = tone === "demo" ? { fg: "var(--pv-demo-fg)", bg: "var(--pv-demo-bg)", bd: "var(--pv-demo-bd)" } : { fg: `var(--${tone}-fg)`, bg: `var(--${tone}-bg)`, bd: `var(--${tone}-bd)` };
  const Icon = tone === "bad" ? OctagonAlert : tone === "warn" ? AlertTriangle : tone === "ok" ? CheckCircle2 : tone === "demo" ? FlaskConical : Info;
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex gap-3 rounded-[var(--radius-card)] border px-3 py-2.5 text-[13px]", className)} style={{ background: t.bg, borderColor: t.bd }}>
      <Icon className="size-4 shrink-0 mt-0.5" style={{ color: t.fg }} aria-hidden />
      <div className="min-w-0 flex-1 text-ink-2">
        {title && <div className="font-semibold" style={{ color: t.fg }}>{title}</div>}
        {children}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-surface-hover", className)} aria-hidden />;
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <div className="mb-3 text-faint">{icon ?? <Inbox className="size-7" aria-hidden />}</div>
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="text-[13px] text-muted mt-1 max-w-md">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="flex flex-col items-center text-center py-8 px-4" role="alert">
      <OctagonAlert className="size-6 mb-2" style={{ color: "var(--bad-fg)" }} aria-hidden />
      <p className="font-semibold">Could not load this data</p>
      <p className="text-[13px] text-muted mt-1 max-w-md">{msg}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-3" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function InsufficientData({ title = "Insufficient data", children }: { title?: string; children: ReactNode }) {
  return (
    <div className="hatched rounded-[var(--radius-card)] border border-dashed border-line-strong p-4 text-[13px]">
      <div className="bg-surface/90 inline-block rounded px-1.5 font-semibold text-ink-2">{title}</div>
      <p className="mt-1.5 bg-surface/90 rounded px-1.5 text-muted">{children}</p>
    </div>
  );
}

export function PageHeader({ title, description, actions, meta }: { title: string; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em] text-ink max-sm:text-[22px] max-sm:leading-7">{title}</h1>
        {description && <p className="text-muted mt-1 max-w-3xl">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KeyValue({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 }) {
  return (
    <dl className={cx("grid gap-x-4 gap-y-3", cols === 2 ? "sm:grid-cols-2" : "")}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[12px] font-medium text-muted">{k}</dt>
          <dd className="text-ink mt-0.5 break-words">{v ?? <span className="text-faint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[13px]", className)}>{children}</span>;
}
