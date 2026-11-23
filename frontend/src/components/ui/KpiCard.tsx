import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { ProvenanceBadge, type Provenance } from "./ProvenanceBadge";
import { Skeleton } from "./primitives";
import { cx } from "../../utils/format";

/** KPI card (DESIGN_SYSTEM §5.1): label, value, hint, provenance chip. Unavailable metrics are hatched with a reason - never shown as zero. */
export function KpiCard({ label, value, unit, hint, provenance, to, loading, unavailable, provenanceTitle }: {
  label: string; value?: ReactNode; unit?: string; hint?: ReactNode; provenance: Provenance; to?: string; loading?: boolean;
  unavailable?: string; provenanceTitle?: string;
}) {
  const body = (
    <div className={cx("h-full bg-surface border border-line rounded-[var(--radius-card)] shadow-card p-4 flex flex-col gap-1.5 min-w-0 overflow-hidden",
      to && "hover:border-line-strong transition-colors", unavailable && "hatched")}>
      <span className="overline text-muted">{label}</span>
      {loading ? <Skeleton className="h-9 w-24" /> : unavailable ? (
        <div className="bg-surface/90 rounded px-1">
          <div className="text-[15px] font-semibold text-ink-2">Not available</div>
          <div className="text-[12px] text-muted">{unavailable}</div>
        </div>
      ) : (
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-kpi font-semibold num text-ink min-w-0 truncate">{value}</span>
          {unit && <span className="text-muted text-[13px]">{unit}</span>}
        </div>
      )}
      {hint && !unavailable && <div className="text-[12px] text-muted">{hint}</div>}
      {!unavailable && <div className="mt-auto pt-1"><ProvenanceBadge kind={provenance} title={provenanceTitle} /></div>}
    </div>
  );
  return to && !unavailable ? <Link to={to} className="block min-w-0 focus-visible:outline-offset-0">{body}</Link> : body;
}
