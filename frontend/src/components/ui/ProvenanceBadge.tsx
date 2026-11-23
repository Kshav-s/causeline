import { BadgeCheck, CircleSlash, Cpu, Database, FlaskConical, FunctionSquare, History, Link2, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../utils/format";

/** Provenance vocabulary (CLAUDE.md §2, DESIGN_SYSTEM §2.1). Dashed = machine generated, solid = recorded/verified. */
export type Provenance = "recorded" | "model" | "nlp" | "similarity" | "rule" | "human" | "insufficient" | "demo" | "historical";

const P: Record<Provenance, { label: string; icon: typeof Cpu; style: "solid" | "dashed" | "dotted"; token: string }> = {
  recorded: { label: "Recorded fact", icon: Database, style: "solid", token: "recorded" },
  model: { label: "Model prediction", icon: Cpu, style: "dashed", token: "model" },
  nlp: { label: "NLP classification", icon: Tag, style: "dashed", token: "nlp" },
  similarity: { label: "Similarity evidence", icon: Link2, style: "dotted", token: "sim" },
  rule: { label: "Rule-based", icon: FunctionSquare, style: "solid", token: "rule" },
  human: { label: "Human verified", icon: BadgeCheck, style: "solid", token: "human" },
  insufficient: { label: "Insufficient data", icon: CircleSlash, style: "dashed", token: "insuf" },
  demo: { label: "Demo data", icon: FlaskConical, style: "solid", token: "demo" },
  historical: { label: "Historical model output", icon: History, style: "dashed", token: "hist" },
};

export function ProvenanceBadge({ kind, label, title, className }: { kind: Provenance; label?: ReactNode; title?: string; className?: string }) {
  const p = P[kind];
  const Icon = p.icon;
  return (
    <span
      title={title ?? p.label}
      className={cx("inline-flex items-center gap-1 h-[22px] px-2 rounded-full border text-[12px] font-medium leading-4 whitespace-nowrap", className)}
      style={{ color: `var(--pv-${p.token}-fg)`, background: `var(--pv-${p.token}-bg)`, borderColor: `var(--pv-${p.token}-bd)`, borderStyle: p.style }}
    >
      <Icon className="size-3" aria-hidden />
      {label ?? p.label}
    </span>
  );
}

export const PROVENANCE_LEGEND: Provenance[] = ["recorded", "rule", "nlp", "model", "similarity", "historical", "human", "insufficient", "demo"];
