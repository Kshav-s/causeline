import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, Info, OctagonAlert, X } from "lucide-react";
import { Button } from "./primitives";
import { cx } from "../../utils/format";

export function Modal({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode; children?: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-graphite-950/50" />
        <Dialog.Content className={cx("fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-h-[calc(100vh-48px)] overflow-auto bg-surface border border-line rounded-[var(--radius-modal)] shadow-pop", wide ? "max-w-2xl" : "max-w-md")}>
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div>
              <Dialog.Title className="text-lg font-semibold text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="text-[13px] text-muted mt-1">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
            </div>
            <Dialog.Close aria-label="Close" className="size-8 grid place-items-center rounded hover:bg-surface-hover text-muted"><X className="size-4" /></Dialog.Close>
          </div>
          {children && <div className="px-5 py-4">{children}</div>}
          {footer && <div className="flex justify-end gap-2 px-5 pb-5 pt-1">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel = "Confirm", danger, onConfirm, loading }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; loading?: boolean }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={body}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>} />
  );
}

export function Drawer({ open, onOpenChange, title, children, footer }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-graphite-950/40" />
        <Dialog.Content className="fixed z-50 right-0 top-0 h-full w-full max-w-xl bg-surface border-l border-line shadow-pop flex flex-col max-sm:rounded-none">
          <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-line shrink-0">
            <Dialog.Title className="text-base font-semibold truncate">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
            <Dialog.Close aria-label="Close" className="size-8 grid place-items-center rounded hover:bg-surface-hover text-muted"><X className="size-4" /></Dialog.Close>
          </div>
          <div className="flex-1 overflow-auto p-5">{children}</div>
          {footer && <div className="border-t border-line p-4 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type Toast = { id: number; tone: "ok" | "bad" | "info"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    if (tone !== "bad") setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-[min(380px,calc(100vw-32px))]">
        {items.map((t) => {
          const Icon = t.tone === "ok" ? CheckCircle2 : t.tone === "bad" ? OctagonAlert : Info;
          return (
            <div key={t.id} role={t.tone === "bad" ? "alert" : "status"} className="flex items-start gap-2 rounded-[var(--radius-card)] border border-line bg-surface shadow-pop px-3 py-2.5 text-[13px]">
              <Icon className="size-4 mt-0.5 shrink-0" style={{ color: `var(--${t.tone}-fg)` }} aria-hidden />
              <span className="flex-1 text-ink">{t.text}</span>
              <button aria-label="Dismiss" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))} className="text-muted hover:text-ink"><X className="size-3.5" /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
