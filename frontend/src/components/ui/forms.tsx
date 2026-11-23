import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AlertCircle, Check, ChevronDown, Search, X } from "lucide-react";
import { cx } from "../../utils/format";

const control = "w-full rounded-[var(--radius-control)] border bg-surface text-ink px-3 text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-petrol-400 focus:border-transparent disabled:opacity-60";

export function Field({ label, error, help, required, optional, children, htmlFor }: { label: string; error?: string; help?: ReactNode; required?: boolean; optional?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink mb-1">
        {label}{required && <span aria-hidden className="text-[var(--bad-fg)]"> *</span>}
        {optional && <span className="ml-1.5 text-[12px] font-normal text-faint">optional</span>}
      </label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-err` : undefined} className="mt-1 flex items-start gap-1 text-[12px] text-[var(--bad-fg)]" role="alert">
          <AlertCircle className="size-3.5 mt-px shrink-0" aria-hidden />{error}
        </p>
      ) : help ? <p className="mt-1 text-[12px] text-muted">{help}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ invalid, className, ...p }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cx(control, "h-9 max-md:h-11", invalid ? "border-[var(--bad-fg)]" : "border-line-strong", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ invalid, className, ...p }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cx(control, "py-2 min-h-24", invalid ? "border-[var(--bad-fg)]" : "border-line-strong", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; options: (string | { value: string; label: string })[]; placeholder?: string }>(
  function Select({ invalid, className, options, placeholder, ...p }, ref) {
    return (
      <select ref={ref} aria-invalid={invalid || undefined} className={cx(control, "h-9 max-md:h-11 pr-8", invalid ? "border-[var(--bad-fg)]" : "border-line-strong", className)} {...p}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  });

export function SearchInput({ value, onChange, placeholder, className, label = "Search" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; label?: string }) {
  return (
    <div className={cx("relative", className)}>
      <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
      <input aria-label={label} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={cx(control, "h-9 max-md:h-11 pl-8 border-line-strong")} />
    </div>
  );
}

export function MultiSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const id = useId();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button aria-label={`${label} filter`} className={cx("inline-flex items-center gap-1.5 h-9 max-md:h-11 px-3 rounded-[var(--radius-control)] border text-[13px] whitespace-nowrap",
          value.length ? "border-petrol-500 bg-primary-tint text-link" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-hover")}>
          {label}{value.length > 0 && <span className="num rounded bg-primary text-white px-1 text-[11px] leading-4">{value.length}</span>}
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} className="z-50 w-72 max-h-80 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-pop p-1">
          {options.length === 0 && <p className="p-3 text-[13px] text-muted">No options</p>}
          {options.map((o) => {
            const on = value.includes(o);
            return (
              <label key={o} htmlFor={`${id}-${o}`} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-hover text-[13px] cursor-pointer">
                <input id={`${id}-${o}`} type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} />
                <span className={cx("size-4 grid place-items-center rounded border", on ? "bg-primary border-primary text-white" : "border-line-strong")} aria-hidden>{on && <Check className="size-3" />}</span>
                <span className="truncate">{o}</span>
              </label>
            );
          })}
          {value.length > 0 && <button className="w-full text-left px-2 py-1.5 text-[13px] text-link hover:underline" onClick={() => onChange([])}>Clear</button>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function FilterChips({ chips, onClear }: { chips: { key: string; label: string; onRemove: () => void }[]; onClear: () => void }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-surface-hover border border-line text-[12px] text-ink-2">
          {c.label}
          <button aria-label={`Remove filter ${c.label}`} onClick={c.onRemove} className="size-4 grid place-items-center rounded-full hover:bg-line"><X className="size-3" /></button>
        </span>
      ))}
      <button onClick={onClear} className="text-[12px] text-link hover:underline ml-1">Clear all</button>
    </div>
  );
}
