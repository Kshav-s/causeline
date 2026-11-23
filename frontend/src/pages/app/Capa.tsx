import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { SyntheticNotice } from "../../components/domain/SyntheticNotice";
import { useUrlState } from "../../hooks/useUrlState";
import { Banner, Card, Mono, PageHeader, Pill, type Tone } from "../../components/ui/primitives";
import { KpiCard } from "../../components/ui/KpiCard";
import { CountTabs, DataTable, Pagination, type Column } from "../../components/ui/DataTable";
import { SearchInput, Select } from "../../components/ui/forms";
import { ChartCard, RateCIList, SimpleTable } from "../../charts/charts";
import { fmtDate, fmtInt, fmtPct } from "../../utils/format";

type Row = { capa_id: string; product_name: string; complaint_category: string; root_cause_category: string | null; root_cause_status: string | null; linked_complaints: number;
  first_complaint: string; effectiveness_label: string | null; effectiveness: string; label_consistent: boolean; recurrences_after: number; capa_status: string | null };
type Resp = { items: Row[]; total: number; tab_counts: Record<string, number>; kpis: { capas_total: number; capas_pending: number; capa_ineffective_rate: number | null; capa_assessable: number; recurred_after_prior_capa: number };
  unavailable_fields: string[]; unavailable_reason: string };
type Eff = { rows: { label: string; n: number; ineffective: number; ineffective_rate: number; ci_low: number | null; ci_high: number | null; significantly_worse: boolean }[]; overall_ineffective_rate: number | null; n: number; basis: string };

export const EFF_TONE: Record<string, Tone> = { Effective: "ok", Ineffective: "bad", Pending: "warn", "Not established": "neu", Inconsistent: "warn" };
const DIMS = [{ value: "root_cause_category", label: "Root cause" }, { value: "complaint_category", label: "Complaint category" }, { value: "food_family", label: "Food family" }, { value: "root_cause_status", label: "Root-cause status" }];

export default function Capa() {
  const { get, set } = useUrlState();
  const nav = useNavigate();
  const tab = get("tab", "all"), page = Number(get("page", "1")), sort = get("sort", "first_complaint"), order = get("order", "desc") as "asc" | "desc";
  const [q, setQ] = useState(get("q"));
  const [dim, setDim] = useState("root_cause_category");
  const list = useQuery({ queryKey: ["capa", tab, page, sort, order, get("q")], placeholderData: keepPreviousData,
    queryFn: () => api.get<Resp>("/api/capa", { tab, page, page_size: 25, sort, order, q: get("q") }) });
  const eff = useQuery({ queryKey: ["capa-eff", dim], queryFn: () => api.get<Eff>("/api/capa/effectiveness", { dimension: dim }) });
  const k = list.data?.kpis;
  const cols: Column<Row>[] = [
    { key: "id", header: "CAPA", sortKey: "capa_id", cell: (r) => <Link to={`/app/capa/${r.capa_id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] text-link hover:underline">{r.capa_id}</Link> },
    { key: "p", header: "Product", cell: (r) => <span className="block max-w-48 truncate" title={r.product_name}>{r.product_name}</span> },
    { key: "c", header: "Category", hideBelow: "xl", cell: (r) => <span className="block max-w-48 truncate">{r.complaint_category}</span> },
    { key: "rc", header: "Root cause (recorded)", hideBelow: "lg", cell: (r) => <span className="block max-w-56 truncate" title={r.root_cause_category ?? ""}>{r.root_cause_category ?? "—"}</span> },
    { key: "first", header: "First complaint", sortKey: "first_complaint", align: "right", cell: (r) => fmtDate(r.first_complaint) },
    { key: "st", header: "CAPA status", hideBelow: "xl", cell: (r) => r.capa_status ?? <span className="text-faint" title="Status only available for open CAPAs listed in the supplied watchlist">—</span> },
    { key: "eff", header: "Effectiveness", cell: (r) => <Pill tone={EFF_TONE[r.effectiveness]} title={r.effectiveness_label ?? undefined}>{r.effectiveness}{!r.label_consistent && " *"}</Pill> },
    { key: "rec", header: "Recurrences", sortKey: "recurrences", align: "right", cell: (r) => <span className={r.recurrences_after ? "font-semibold text-[var(--bad-fg)]" : ""}>{r.recurrences_after}</span> },
  ];
  return (
    <>
      <PageHeader title="CAPA effectiveness" description="A closed CAPA is not assumed effective. Effectiveness is judged from later complaints linked to the CAPA." />
      <SyntheticNotice what="CAPA records and effectiveness rates" />
      {list.data && <Banner tone="info" className="mb-5" title="Partly supported by the supplied data">
        Owner, open/close dates and the actions taken are not available - {list.data.unavailable_reason} CAPAs are identified from complaint records; effectiveness uses the recorded, rule-based label from the source data; recurrences are later complaints whose recorded prior CAPA is this CAPA.
      </Banner>}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-5">
        <KpiCard label="CAPAs" value={fmtInt(k?.capas_total)} provenance="recorded" loading={list.isLoading} />
        <KpiCard label="Effectiveness pending" value={fmtInt(k?.capas_pending)} provenance="recorded" hint="Not closed or follow-up not complete" loading={list.isLoading} to="/app/capa?tab=pending" />
        <KpiCard label="Ineffective rate" value={fmtPct(k?.capa_ineffective_rate)} provenance="rule" hint={k ? `of ${fmtInt(k.capa_assessable)} assessed CAPAs` : undefined} loading={list.isLoading} to="/app/capa?tab=ineffective" />
        <KpiCard label="Complaints recurring after a CAPA" value={fmtInt(k?.recurred_after_prior_capa)} provenance="recorded" loading={list.isLoading} hint="Linked to the earlier CAPA by identifier" />
      </div>
      <ChartCard className="mb-4" title="Where CAPAs fail most often" subtitle={eff.data ? `Ineffective rate by ${DIMS.find((x) => x.value === dim)?.label.toLowerCase()} · overall ${fmtPct(eff.data.overall_ineffective_rate)} (n=${fmtInt(eff.data.n)})` : undefined}
        provenance="rule" loading={eff.isLoading} error={eff.error} empty={!eff.data?.rows.length} height={Math.max(220, Math.min(560, (eff.data?.rows.length ?? 8) * 28 + 70))}
        definition={eff.data?.basis} actions={<Select aria-label="Group by" value={dim} onChange={(e) => setDim(e.target.value)} options={DIMS} className="w-48 h-8" />}
        table={<SimpleTable head={["Group", "n", "Ineffective", "Rate %", "95% CI"]} rows={(eff.data?.rows ?? []).map((r) => [r.label, r.n, r.ineffective, (r.ineffective_rate * 100).toFixed(1), `${((r.ci_low ?? 0) * 100).toFixed(0)}–${((r.ci_high ?? 0) * 100).toFixed(0)}%`])} />}>
        <div className="h-full overflow-auto pr-1"><RateCIList rows={(eff.data?.rows ?? []).filter((r) => r.n >= 10)} overall={eff.data?.overall_ineffective_rate ?? null} /></div>
      </ChartCard>
      <Card bodyClass="p-0">
        <div className="px-4 pt-2"><CountTabs label="Effectiveness" value={tab} onChange={(t) => set({ tab: t === "all" ? null : t })} tabs={[
          { id: "all", label: "All", count: list.data?.tab_counts.all }, { id: "pending", label: "Pending", count: list.data?.tab_counts.pending },
          { id: "effective", label: "Effective", count: list.data?.tab_counts.effective }, { id: "ineffective", label: "Ineffective", count: list.data?.tab_counts.ineffective },
          { id: "not_established", label: "Cannot be established", count: list.data?.tab_counts.not_established }]} /></div>
        <div className="p-4 border-b border-line"><form onSubmit={(e) => { e.preventDefault(); set({ q }); }}><SearchInput value={q} onChange={setQ} placeholder="CAPA ID or product (press Enter)" className="w-80 max-md:w-full" /></form></div>
        <DataTable caption="CAPAs" columns={cols} rows={list.data?.items} rowKey={(r) => r.capa_id} loading={list.isLoading} error={list.error}
          sort={{ key: sort, order }} onSort={(s) => set({ sort: s, order: sort === s && order === "desc" ? "asc" : "desc" })} onRowClick={(r) => nav(`/app/capa/${r.capa_id}`)}
          mobileCard={(r) => <div><div className="flex justify-between"><Mono className="text-[12px] text-link">{r.capa_id}</Mono><Pill tone={EFF_TONE[r.effectiveness]}>{r.effectiveness}</Pill></div><div className="text-[13px] truncate">{r.product_name}</div><div className="text-[12px] text-muted">{r.recurrences_after} recurrences</div></div>} />
        {list.data && <Pagination page={page} pageSize={25} total={list.data.total} onPage={(p) => set({ page: String(p) }, false)} />}
        <p className="px-4 pb-3 text-[12px] text-muted">* Linked complaints carry different effectiveness labels; the most common label is shown.</p>
      </Card>
    </>
  );
}
