import { FlaskConical } from "lucide-react";
import { useCapabilities } from "../../hooks/auth";
import { fmtInt } from "../../utils/format";

/** C2 (approved 2026-11-23): page-level SYNTHETIC DEMO DATA notice for analytics built on the synthetic historical records. */
export function SyntheticNotice({ what = "These figures" }: { what?: string }) {
  const { data: caps } = useCapabilities();
  if (!caps || caps.data.synthetic_complaints === 0) return null;
  return (
    <div role="note" className="mb-5 flex items-start gap-2.5 rounded-[var(--radius-card)] border px-3 py-2.5 text-[13px]"
      style={{ background: "var(--pv-demo-bg)", borderColor: "var(--pv-demo-bd)" }}>
      <FlaskConical className="size-4 mt-0.5 shrink-0" style={{ color: "var(--pv-demo-fg)" }} aria-hidden />
      <p className="text-ink-2">
        <b className="tracking-wide" style={{ color: "var(--pv-demo-fg)" }}>SYNTHETIC DEMO DATA</b> - {what} are computed from {fmtInt(caps.data.synthetic_complaints)} synthetic
        demonstration records (SYNTHETIC_ABT_CPD) out of {fmtInt(caps.data.complaints)} stored. They are not genuine ABT CPD complaints and do not describe real performance.
      </p>
    </div>
  );
}
