import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { Banner, Card, ErrorState, InsufficientData, KeyValue, PageHeader, Pill, SeverityPill, Skeleton, StatusPill } from "../../components/ui/primitives";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { Stepper } from "../../components/ui/Stepper";
import { ChartCard, ColumnChart, Legend, SimpleTable } from "../../charts/charts";
import { EFF_TONE } from "./Capa";
import { fmtDate, fmtMonth } from "../../utils/format";

type C = { complaint_id: string; received: string; product_name: string; complaint_category: string; severity: string | null; status: string; follow_up_days: number | null };
type D = { capa_id: string; product_name: string; complaint_category: string; food_family: string | null; root_cause_category: string | null; root_cause_status: string | null;
  effectiveness_labels: string[]; effectiveness: string; capa_status: string | null; capa_status_source: string | null; originating_complaints: C[]; recurrences: C[]; first_complaint: string;
  timeline: { month: string; n: number }[]; timeline_scope: string; rule: string; unavailable_fields: string[]; unavailable_reason: string };

const STAGES = ["Raised", "Action planned", "Implemented", "Closed", "Effectiveness check", "Outcome"];

function ComplaintList({ rows, empty }: { rows: C[]; empty: string }) {
  if (!rows.length) return <p className="text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((c) => (
        <li key={c.complaint_id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <div><Link to={`/app/complaints/${c.complaint_id}`} className="font-mono text-[12px] text-link hover:underline">{c.complaint_id}</Link><span className="text-muted"> · {fmtDate(c.received)}</span>
            {c.follow_up_days !== null && <span className="text-muted"> · {c.follow_up_days} days after CAPA</span>}</div>
          <div className="flex items-center gap-2"><SeverityPill value={c.severity} /><StatusPill value={c.status} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function CapaDetail() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["capa", id], queryFn: () => api.get<D>(`/api/capa/${encodeURIComponent(id)}`) });
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-80 w-full" /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const stage = d.effectiveness === "Effective" || d.effectiveness === "Ineffective" ? 6 : d.capa_status === "Closed" ? 4 : d.capa_status === "Awaiting verification" ? 3 : d.capa_status === "In progress" ? 1 : 0;
  const firstMonth = d.first_complaint.slice(0, 7);
  const recMonths = new Set(d.recurrences.map((r) => r.received.slice(0, 7)));
  return (
    <>
      <PageHeader title={d.capa_id} description={`${d.product_name} · ${d.complaint_category}`}
        meta={<><Pill tone={EFF_TONE[d.effectiveness]}>Effectiveness: {d.effectiveness}</Pill>{d.capa_status && <Pill tone="info">Status: {d.capa_status}</Pill>}</>} />
      <Card className="mb-4" bodyClass="py-3"><Stepper label="CAPA stage" steps={STAGES} current={stage} blocked={d.effectiveness === "Ineffective"} /></Card>
      <Banner tone={d.effectiveness === "Ineffective" ? "bad" : d.effectiveness === "Effective" ? "ok" : "warn"} className="mb-4"
        title={d.effectiveness === "Ineffective" ? "Problem recurred after this CAPA" : d.effectiveness === "Effective" ? "No similar recurrence recorded in the follow-up window" : "Effectiveness cannot yet be established"}>
        Recorded label{d.effectiveness_labels.length > 1 ? "s" : ""}: {d.effectiveness_labels.join(" / ") || "none"}. {d.rule}
      </Banner>
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8 space-y-4 min-w-0">
          <ChartCard title="Complaints over time" subtitle={d.timeline_scope} provenance="recorded" empty={!d.timeline.length} height={240}
            table={<SimpleTable head={["Month", "Complaints"]} rows={d.timeline.map((t) => [fmtMonth(t.month), t.n])} />}>
            <div className="h-full flex flex-col">
              <Legend items={[{ label: "Same product & category", color: "var(--c1)" }, { label: "Month with a linked recurrence or the CAPA's first complaint", color: "var(--c2)" }]} />
              <div className="flex-1 min-h-0"><ColumnChart data={d.timeline.slice(-48)} xKey="month" yKey="n" label="Complaints" highlight={(p) => recMonths.has(p.month) || p.month === firstMonth} /></div>
            </div>
          </ChartCard>
          <Card title={`Originating complaints (${d.originating_complaints.length})`} actions={<ProvenanceBadge kind="recorded" />}><ComplaintList rows={d.originating_complaints} empty="None" /></Card>
          <Card title={`Recurrences after this CAPA (${d.recurrences.length})`} subtitle="Later complaints whose recorded prior CAPA is this CAPA" actions={<ProvenanceBadge kind="recorded" />}>
            <ComplaintList rows={d.recurrences} empty="No linked recurrence has been recorded." />
          </Card>
        </div>
        <div className="xl:col-span-4 space-y-4">
          <Card title="Details" actions={<ProvenanceBadge kind="recorded" />}>
            <KeyValue cols={1} items={[["Product", d.product_name], ["Complaint category", d.complaint_category], ["Food family", d.food_family], ["Root cause (recorded)", d.root_cause_category],
              ["Root-cause status", d.root_cause_status], ["First linked complaint", fmtDate(d.first_complaint)], ["CAPA status", d.capa_status ? <>{d.capa_status}<div className="text-[11px] text-muted break-all">source: {d.capa_status_source}</div></> : "Not in the supplied open-CAPA watchlist"]]} />
          </Card>
          <InsufficientData title="Not available">{d.unavailable_fields.join(", ")} - {d.unavailable_reason}</InsufficientData>
        </div>
      </div>
    </>
  );
}
