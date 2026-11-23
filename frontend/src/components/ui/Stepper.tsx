import { Check } from "lucide-react";
import { cx } from "../../utils/format";

/** Stage stepper: completed (filled + check), current (ring), future (muted). Collapses to "Step n of N" on mobile. */
export function Stepper({ steps, current, label, blocked }: { steps: string[]; current: number; label: string; blocked?: boolean }) {
  return (
    <nav aria-label={label}>
      <p className="sm:hidden text-[13px] text-ink-2"><span className="font-semibold">Step {Math.min(current + 1, steps.length)} of {steps.length}</span> · {steps[Math.min(current, steps.length - 1)]}</p>
      <ol className="max-sm:hidden flex items-center gap-0">
        {steps.map((s, i) => {
          const done = i < current, now = i === current;
          return (
            <li key={s} className="flex items-center flex-1 last:flex-none min-w-0" aria-current={now ? "step" : undefined}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={cx("size-6 shrink-0 grid place-items-center rounded-full text-[11px] font-semibold border-2",
                  done && "bg-primary border-primary text-white",
                  now && (blocked ? "border-[var(--bad-fg)] text-[var(--bad-fg)]" : "border-primary text-link bg-surface"),
                  !done && !now && "border-line-strong text-faint bg-surface")}>
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cx("text-[12px] font-medium truncate max-lg:hidden", now ? "text-ink" : done ? "text-ink-2" : "text-faint")}>{s}</span>
              </div>
              {i < steps.length - 1 && <span className={cx("h-0.5 flex-1 mx-2 min-w-3", done ? "bg-primary" : "bg-line")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
