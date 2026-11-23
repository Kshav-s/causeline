import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ProvenanceBadge } from "./ui/ProvenanceBadge";
import { KpiCard } from "./ui/KpiCard";
import { DataTable } from "./ui/DataTable";
import { AnalysisResult } from "./domain/AnalysisResult";
import type { AnalysisRun, Prediction } from "../types/api";

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

const model = (key: string, extra: Partial<Prediction["model"]> = {}) => ({ key, version: "0.1.0", name: key, kind: "ml", status: "ready", confidence_supported: true, low_confidence_threshold: 0.5, limitations: ["Synthetic"], metrics: {}, ...extra });
function pred(key: string, over: Partial<Prediction>): Prediction {
  return { id: 1, reference: `PRD-${key}`, run_id: "r", status: "completed", subject_type: "text", complaint_pk: null, model: model(key), input: { text: "metal piece in bread" },
    output: null, top_label: null, top_score: null, low_confidence: false, message: null, review_status: "not_applicable", reviews: [], created_at: "2026-11-23T10:00:00", ...over };
}
const run = (p: Record<string, Prediction>): AnalysisRun => ({ run_id: "r", created_at: "2026-11-23T10:00:00", predictions: p });

describe("ProvenanceBadge", () => {
  it("uses dashed borders for machine output and solid for recorded facts", () => {
    render(<><ProvenanceBadge kind="model" /><ProvenanceBadge kind="recorded" /></>);
    expect(screen.getByText("Model prediction").closest("span")!.style.borderStyle).toBe("dashed");
    expect(screen.getByText("Recorded fact").closest("span")!.style.borderStyle).toBe("solid");
  });
});

describe("KpiCard", () => {
  it("shows 'Not available' with a reason instead of a zero", () => {
    wrap(<KpiCard label="CAPA rate" value="0%" provenance="rule" unavailable="No assessed CAPAs" />);
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});

describe("DataTable", () => {
  it("renders both the table and the mobile card list", () => {
    wrap(<DataTable caption="t" rows={[{ id: 1, n: "A" }]} rowKey={(r) => r.id} columns={[{ key: "n", header: "Name", cell: (r) => r.n }]} mobileCard={(r) => <span>card {r.n}</span>} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("card A")).toBeInTheDocument();
  });
  it("shows an empty state", () => {
    wrap(<DataTable caption="t" rows={[]} rowKey={() => 1} columns={[]} />);
    expect(screen.getByText("No records match")).toBeInTheDocument();
  });
});

describe("AnalysisResult", () => {
  it("flags low confidence and keeps the shortlist", () => {
    wrap(<AnalysisResult run={run({ "nlp-category": pred("nlp-category", { top_label: "Physical defect / foreign matter", top_score: 0.24, low_confidence: true, review_status: "pending",
      output: { predictions: [{ label: "Physical defect / foreign matter", probability: 0.24 }, { label: "Packaging issue", probability: 0.2 }, { label: "Weight / quantity issue", probability: 0.1 }] } }) })} />);
    expect(screen.getByText(/Uncertain prediction - manual classification recommended/)).toBeInTheDocument();
    expect(screen.getByText("Awaiting human review")).toBeInTheDocument();
    expect(screen.getByText("2. Packaging issue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm/ })).toBeInTheDocument();
  });
  it("shows insufficient data instead of inventing a result", () => {
    wrap(<AnalysisResult run={run({ "root-cause": pred("root-cause", { status: "insufficient_data", message: "Required for root-cause hypotheses: complaint_category" }) })} />);
    expect(screen.getByText(/insufficient data/i)).toBeInTheDocument();
    expect(screen.getByText(/Required for root-cause hypotheses/)).toBeInTheDocument();
  });
  it("labels the food-safety flag as a rule, not a determination", () => {
    wrap(<AnalysisResult run={run({ "food-safety-flag": pred("food-safety-flag", { output: { escalate_for_food_safety_review: true, reason_keywords: ["metal"], reason_category_in_safety_bucket: false } }) })} />);
    expect(screen.getByText(/rule-based flag/)).toBeInTheDocument();
    expect(screen.getByText(/not a food-safety determination/)).toBeInTheDocument();
  });
  it("reports an unavailable model as unavailable", () => {
    wrap(<AnalysisResult run={run({ "nlp-similarity": pred("nlp-similarity", { status: "error", message: "Model 'nlp-similarity' is not available (degraded)" }) })} />);
    expect(screen.getByText("Similarity search unavailable")).toBeInTheDocument();
  });
});
