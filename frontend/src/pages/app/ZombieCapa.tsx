import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { SyntheticNotice } from "../../components/domain/SyntheticNotice";
import { useUrlState } from "../../hooks/useUrlState";
import { Banner, Card, Mono, PageHeader, Pill } from "../../components/ui/primitives";
import { KpiCard } from "../../components/ui/KpiCard";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { CountTabs, DataTable, Pagination, type Column } from "../../components/ui/DataTable";
import { SearchInput } from "../../components/ui/forms";
import { fmtDate, fmtInt, fmtPct } from "../../utils/format";

type Row = { capa_id: string; product_name: string; complaint_category: string; root_cause_category: string | null; root_cause_status: string | null;
  effectiveness_label: string | null; originating_complaints: number; first_complaint: string; investigations: string[]; recurrences: number;
  critical_recurrences: number; open_recurrences: number; first_recurrence: string; last_recurrence: string; days_to_first_recurrence: number | null;
  same_cause: number; different_cause: number; unknown_cause: number; during_follow_up: boolean };
type Summary = { closed_capas: number; zombies: number; zombie_share: number | null; recurrences: number; same_cause: number; different_cause: number;
  unknown_cause: number; median_days_to_first: number | null; first_within_30_days: number; recurred_during_follow_up: number; labelled_ineffective_without_link: number };
type Resp = { items: Row[]; total: number; summary: Summary; rule: string };

function CauseSplit({ r }: { r: Row }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] num" title="Recorded root cause of the recurrences compared with the original investigation">
      {r.same_cause > 0 && <Pill tone="bad">{r.same_cause} same</Pill>}
      {r.different_cause > 0 && <Pill tone="warn">{r.different_cause} different</Pill>}
      {r.unknown_cause > 0 && <Pill tone="neu">{r.unknown_cause} not recorded</Pill>}
    </span>
  );
}

export default function ZombieCapa() {
  const { get, set } = useUrlState();
  const nav = useNavigate();
  const page = Number(get("page", "1")), sort = get("sort", "recurrences"), order = get("order", "desc") as "asc" | "desc", cause = get("cause", "all");
  const [q, setQ] = useState(get("q"));
  const r = useQuery({ queryKey: ["zombies", page, sort, order, cause, get("q")], placeholderData: keepPreviousData,
    queryFn: () => api.get<Resp>("/api/capa/zombies", { page, page_size: 25, sort, order, cause, q: get("q") }) });
  const s = r.data?.summary;
  const cols: Column<Row>[] = [
    { key: "id", header: "CAPA", sortKey: "capa_id", cell: (x) => <Link to={`/app/capa/${x.capa_id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12px] text-link hover:underline">{x.capa_id}</Link> },
    { key: "p", header: "Product", cell: (x) => <span className="block max-w-44 truncate" title={`${x.product_name} · ${x.complaint_category}`}>{x.product_name}</span> },
    { key: "rc", header: "Original root cause", hideBelow: "xl", cell: (x) => <span className="block max-w-52 truncate" title={`${x.root_cause_category ?? "Not recorded"} (${x.root_cause_status ?? "no status"})`}>{x.root_cause_category ?? <span className="text-faint">Not recorded</span>}</span> },
    { key: "inv", header: "Earlier investigation", hideBelow: "lg", cell: (x) => x.investigations.length ? <Mono className="text-[12px]">{x.investigations[0]}{x.investigations.length > 1 && ` +${x.investigations.length - 1}`}</Mono> : <span className="text-faint">None recorded</span> },
    { key: "rec", header: "Recurrences", sortKey: "recurrences", align: "right", cell: (x) => <span className="font-semibold text-[var(--bad-fg)]">{x.recurrences}</span> },
    { key: "crit", header: "Critical", sortKey: "critical", align: "right", hideBelow: "xl", cell: (x) => x.critical_recurrences || <span className="text-faint">0</span> },
    { key: "days", header: "Days to first", sortKey: "days_to_first", align: "right", cell: (x) => x.days_to_first_recurrence ?? "—" },
    { key: "cause", header: "Recurrence cause", hideBelow: "2xl", cell: (x) => <CauseSplit r={x} /> },
    { key: "last", header: "Last recurrence", sortKey: "last_recurrence", align: "right", hideBelow: "lg", cell: (x) => fmtDate(x.last_recurrence) },
  ];
  return (
    <>
      <PageHeader title="Zombie CAPA detector" description="Closed corrective actions whose problem came back. Each one is linked to the complaints that triggered it, the earlier investigation and the complaints that recurred afterwards."
        meta={<ProvenanceBadge kind="rule" label="Rule-based on recorded identifiers" />} />
      <SyntheticNotice what="CAPA records and recurrences" />
      {r.data && <Banner tone="info" className="mb-5" title="How a zombie CAPA is identified">{r.data.rule}</Banner>}
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-5">
        <KpiCard label="Zombie CAPAs" value={fmtInt(s?.zombies)} provenance="rule" loading={r.isLoading} hint={s ? `${fmtPct(s.zombie_share)} of ${fmtInt(s.closed_capas)} closed CAPAs` : undefined} />
        <KpiCard label="Recurrences after closure" value={fmtInt(s?.recurrences)} provenance="recorded" loading={r.isLoading} hint="Complaints linked to a closed CAPA by identifier" />
        <KpiCard label="Same root cause returned" value={fmtInt(s?.same_cause)} provenance="recorded" loading={r.isLoading}
          hint={s ? `${fmtInt(s.different_cause)} different · ${fmtInt(s.unknown_cause)} not recorded` : undefined} to="/app/capa/zombies?cause=same" />
        <KpiCard label="Median days to first recurrence" value={s?.median_days_to_first ?? "—"} provenance="recorded" loading={r.isLoading}
          hint={s ? `${fmtInt(s.first_within_30_days)} came back within 30 days` : undefined} unavailable={s && s.median_days_to_first === null ? "No follow-up days recorded" : undefined} />
      </div>
      <Card bodyClass="p-0">
        <div className="px-4 pt-2"><CountTabs label="Recurrence cause" value={cause} onChange={(t) => set({ cause: t === "all" ? null : t })} tabs={[
          { id: "all", label: "All zombies" }, { id: "same", label: "Same cause returned" }, { id: "different", label: "Different cause recorded" }]} /></div>
        <div className="p-4 border-b border-line"><form onSubmit={(e) => { e.preventDefault(); set({ q }); }}><SearchInput value={q} onChange={setQ} placeholder="CAPA ID or product (press Enter)" className="w-80 max-md:w-full" label="Search zombie CAPAs" /></form></div>
        <DataTable caption="Zombie CAPAs" columns={cols} rows={r.data?.items} rowKey={(x) => x.capa_id} loading={r.isLoading} error={r.error} onRetry={() => r.refetch()}
          sort={{ key: sort, order }} onSort={(k) => set({ sort: k, order: sort === k && order === "desc" ? "asc" : "desc" })} onRowClick={(x) => nav(`/app/capa/${x.capa_id}`)}
          empty={<p className="p-6 text-[13px] text-muted">No closed CAPA matches these filters.</p>}
          mobileCard={(x) => (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2"><Mono className="text-[12px] text-link">{x.capa_id}</Mono><span className="text-[12px] font-semibold text-[var(--bad-fg)]">{x.recurrences} recurrences</span></div>
              <div className="text-[13px] truncate">{x.product_name}</div>
              <div className="text-[12px] text-muted truncate">{x.root_cause_category ?? "Root cause not recorded"}{x.investigations[0] && ` · ${x.investigations[0]}`}</div>
              <div className="flex items-center justify-between text-[12px] text-muted"><CauseSplit r={x} /><span>{x.days_to_first_recurrence ?? "—"} days to first</span></div>
            </div>
          )} />
        {r.data && <Pagination page={page} pageSize={25} total={r.data.total} onPage={(p) => set({ page: String(p) }, false)} />}
      </Card>
      {s && <p className="mt-3 text-[12px] text-muted">Data notes: {fmtInt(s.recurred_during_follow_up)} CAPAs recurred while their follow-up window was still running (label "Pending - insufficient follow-up"). {fmtInt(s.labelled_ineffective_without_link)} CAPAs are labelled Ineffective in the source data but no later complaint names them as the prior CAPA, so they are not counted here.</p>}
    </>
  );
}
