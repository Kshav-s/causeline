import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { cx, fmtInt } from "../../utils/format";
import { EmptyState, ErrorState, Skeleton } from "./primitives";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  sortKey?: string;
  className?: string;
  /** hide below this breakpoint (low-priority columns) */
  hideBelow?: "lg" | "xl";
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, onRowClick, sort, onSort, mobileCard, caption, compact }: {
  columns: Column<T>[]; rows: T[] | undefined; rowKey: (r: T) => string | number; loading?: boolean; error?: unknown; onRetry?: () => void;
  empty?: ReactNode; onRowClick?: (r: T) => void; sort?: { key: string; order: "asc" | "desc" }; onSort?: (key: string) => void;
  mobileCard?: (r: T) => ReactNode; caption: string; compact?: boolean;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  const hide = (c: Column<T>) => (c.hideBelow === "lg" ? "max-lg:hidden" : c.hideBelow === "xl" ? "max-xl:hidden" : "");
  const rowH = compact ? "h-9" : "h-11";
  return (
    <>
      <div className={cx("overflow-x-auto", mobileCard && "max-md:hidden")}>
        <table className="w-full text-[13px] border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-[1]">
            <tr className="bg-surface-2 text-left">
              {columns.map((c) => {
                const active = sort && c.sortKey && sort.key === c.sortKey;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.order === "asc" ? "ascending" : "descending") : undefined}
                    className={cx("px-3 h-9 font-semibold text-[12px] text-muted border-b border-line whitespace-nowrap", c.align === "right" && "text-right", hide(c), c.className)}>
                    {c.sortKey && onSort ? (
                      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort(c.sortKey!)}>
                        {c.header}
                        {active && (sort!.order === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className={rowH}>{columns.map((c) => <td key={c.key} className={cx("px-3 border-b border-line", hide(c))}><Skeleton className="h-3.5 w-full max-w-32" /></td>)}</tr>
            ))}
            {!loading && rows?.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx(rowH, "border-b border-line", onRowClick && "cursor-pointer hover:bg-surface-hover")}>
                {columns.map((c) => (
                  <td key={c.key} className={cx("px-3 py-1.5 align-middle", c.align === "right" && "text-right num", hide(c), c.className)}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mobileCard && (
        <ul className="md:hidden divide-y divide-line">
          {loading && Array.from({ length: 5 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-12 w-full" /></li>)}
          {!loading && rows?.map((r) => (
            <li key={rowKey(r)}>
              {onRowClick ? <button className="w-full text-left p-3 hover:bg-surface-hover min-h-11" onClick={() => onRowClick(r)}>{mobileCard(r)}</button> : <div className="p-3">{mobileCard(r)}</div>}
            </li>
          ))}
        </ul>
      )}
      {!loading && rows && rows.length === 0 && (empty ?? <EmptyState title="No records match" />)}
    </>
  );
}

export function Pagination({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px] text-muted border-t border-line">
      <span className="num">{fmtInt(from)}–{fmtInt(Math.min(page * pageSize, total))} of {fmtInt(total)}</span>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <label className="flex items-center gap-1.5 max-sm:hidden">Rows
            <select className="h-8 rounded-[var(--radius-control)] border border-line bg-surface px-1.5 text-ink" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
              {[25, 50, 100].map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        )}
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="size-8 max-md:size-10 grid place-items-center rounded border border-line bg-surface disabled:opacity-40 hover:bg-surface-hover"><ChevronLeft className="size-4" /></button>
        <span className="num text-ink">{page} / {fmtInt(pages)}</span>
        <button aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="size-8 max-md:size-10 grid place-items-center rounded border border-line bg-surface disabled:opacity-40 hover:bg-surface-hover"><ChevronRight className="size-4" /></button>
      </div>
    </div>
  );
}

export function CountTabs({ tabs, value, onChange, label }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line -mb-px">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx("flex items-center gap-2 px-3 h-10 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors",
            value === t.id ? "border-primary text-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
          {t.count !== undefined && <span className={cx("num rounded-full px-1.5 text-[11px] leading-[18px]", value === t.id ? "bg-primary-tint text-link" : "bg-surface-hover text-muted")}>{fmtInt(t.count)}</span>}
        </button>
      ))}
    </div>
  );
}
