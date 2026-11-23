import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Lock, MessageSquarePlus } from "lucide-react";
import { api } from "../../services/api";
import { Card, Mono, Pill, SeverityPill, StatusPill } from "../../components/ui/primitives";
import { CountTabs, DataTable, Pagination, type Column } from "../../components/ui/DataTable";
import { FilterChips, MultiSelect, SearchInput } from "../../components/ui/forms";
import { ProvenanceBadge } from "../../components/ui/ProvenanceBadge";
import { keyFor } from "../../utils/localComplaints";
import { fmtDate } from "../../utils/format";

type Row = { complaint_id: string; submitted: string; product_name: string; category: string | null; category_source: string | null; predicted_category: string | null;
  severity: string | null; status: string; analysis_status: string; source: string; is_synthetic: boolean };
type Resp = { items: Row[]; total: number; categories: string[]; severities: string[]; statuses: string[] };
const ANALYSIS: Record<string, [string, "ok" | "warn" | "bad" | "info" | "neu"]> = {
  completed: ["Analysed", "ok"], analysed: ["Analysed", "ok"], partial: ["Partly analysed", "warn"], failed: ["Analysis failed", "bad"], pending: ["Pending", "info"], not_run: ["Historical record", "neu"],
};

export default function Register() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const get = (k: string, d = "") => sp.get(k) ?? d;
  const set = (patch: Record<string, string | string[] | null>) => setSp((p) => {
    const n = new URLSearchParams(p);
    Object.entries(patch).forEach(([k, v]) => { n.delete(k); if (Array.isArray(v)) v.forEach((x) => n.append(k, x)); else if (v) n.set(k, v); });
    if (!("page" in patch)) n.delete("page");
    return n;
  }, { replace: true });
  const [q, setQ] = useState(get("q"));
  useEffect(() => { const t = setTimeout(() => q !== get("q") && set({ q }), 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const page = Number(get("page", "1")), sort = get("sort", "date"), order = get("order", "desc") as "asc" | "desc", source = get("source", "all");
  const params = { q: get("q"), page, page_size: 25, sort, order, source, category: sp.getAll("category"), severity: sp.getAll("severity"), status: sp.getAll("status") };
  const r = useQuery({ queryKey: ["public-register", params], placeholderData: keepPreviousData, queryFn: () => api.get<Resp>("/api/public/register", params) });
  const chips = (["category", "severity", "status"] as const).flatMap((k) => sp.getAll(k).map((v) => ({ key: k + v, label: v, onRemove: () => set({ [k]: sp.getAll(k).filter((x) => x !== v) }) })));
  const open = (row: Row) => { const k = keyFor(row.complaint_id); nav(k ? `/complaint/${row.complaint_id}#key=${encodeURIComponent(k)}` : `/track?id=${encodeURIComponent(row.complaint_id)}`); };
  const cols: Column<Row>[] = [
    { key: "id", header: "Complaint ID", sortKey: "id", cell: (x) => <span className="inline-flex flex-wrap items-center gap-1.5"><Mono className="text-[12px] text-link">{x.complaint_id}</Mono>{keyFor(x.complaint_id) && <Pill tone="info">Yours</Pill>}{x.is_synthetic && <ProvenanceBadge kind="demo" />}</span> },
    { key: "d", header: "Submitted", sortKey: "date", align: "right", cell: (x) => fmtDate(x.submitted) },
    { key: "p", header: "Product", sortKey: "product", cell: (x) => <span className="block max-w-52 truncate" title={x.product_name}>{x.product_name}</span> },
    { key: "c", header: "Category", cell: (x) => x.category ? <span className="block max-w-56 truncate" title={x.category}>{x.category}{x.category_source === "human_verified" && <ProvenanceBadge kind="human" label="Verified" className="ml-1.5" />}</span>
      : x.predicted_category ? <ProvenanceBadge kind="nlp" label={`AI suggestion: ${x.predicted_category}`} className="max-w-60 truncate" /> : <span className="text-faint">Not classified</span> },
    { key: "s", header: "Severity", sortKey: "severity", cell: (x) => <SeverityPill value={x.severity} /> },
    { key: "a", header: "Analysis", hideBelow: "lg", cell: (x) => { const [l, t] = ANALYSIS[x.analysis_status] ?? ANALYSIS.not_run; return <Pill tone={t}>{l}</Pill>; } },
    { key: "st", header: "Investigation", cell: (x) => <StatusPill value={x.status} /> },
  ];
  return (
    <div className="bg-canvas">
      <div className="bg-graphite-950 grid-texture text-white pt-28 pb-12">
        <div className="max-w-[1200px] mx-auto px-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="overline text-petrol-400">Complaint register</p>
            <h1 className="mt-2 text-[36px] leading-[44px] max-md:text-[28px] font-semibold tracking-[-0.01em]">All complaints and their status</h1>
            <p className="mt-3 text-graphite-300 max-w-2xl">Reference, product, category and status only. Names, contact details, descriptions and photos are private.</p>
          </div>
          <Link to="/raise" className="h-10 px-4 inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-petrol-500 hover:bg-petrol-600 font-medium text-sm"><MessageSquarePlus className="size-4" />Raise a Complaint</Link>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-5 py-10">
        <Card bodyClass="p-0">
          <div className="px-4 pt-2"><CountTabs label="Source" value={source} onChange={(v) => set({ source: v === "all" ? null : v })} tabs={[{ id: "all", label: "All complaints" }, { id: "public", label: "Raised on CauseLine" }]} /></div>
          <div className="p-4 border-b border-line">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={q} onChange={setQ} placeholder="Reference or product" className="w-64 max-md:w-full" label="Search the register" />
              <MultiSelect label="Category" options={r.data?.categories ?? []} value={sp.getAll("category")} onChange={(v) => set({ category: v })} />
              <MultiSelect label="Severity" options={r.data?.severities ?? []} value={sp.getAll("severity")} onChange={(v) => set({ severity: v })} />
              <MultiSelect label="Status" options={r.data?.statuses ?? []} value={sp.getAll("status")} onChange={(v) => set({ status: v })} />
            </div>
            <FilterChips chips={chips} onClear={() => { setQ(""); set({ category: null, severity: null, status: null, q: null }); }} />
          </div>
          <DataTable caption="Complaint register" columns={cols} rows={r.data?.items} rowKey={(x) => x.complaint_id} loading={r.isLoading} error={r.error} onRetry={() => r.refetch()}
            sort={{ key: sort, order }} onSort={(k) => set({ sort: k, order: sort === k && order === "desc" ? "asc" : "desc" })} onRowClick={open}
            mobileCard={(x) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2"><Mono className="text-[12px] text-link">{x.complaint_id}</Mono><StatusPill value={x.status} /></div>
                {x.is_synthetic && <ProvenanceBadge kind="demo" />}
                <div className="text-[13px] truncate">{x.product_name}</div>
                <div className="min-w-0">{x.category ? <span className="text-[12px] text-ink-2">{x.category}</span> : x.predicted_category ? <ProvenanceBadge kind="nlp" label={`AI suggestion: ${x.predicted_category}`} className="max-w-full truncate" /> : <span className="text-[12px] text-faint">Not classified</span>}</div>
                <div className="flex items-center justify-between text-[12px] text-muted"><SeverityPill value={x.severity} /><span>{fmtDate(x.submitted)}</span></div>
              </div>
            )} />
          {r.data && <Pagination page={page} pageSize={25} total={r.data.total} onPage={(p) => set({ page: String(p) })} />}
        </Card>
        <p className="mt-4 text-[12px] text-muted flex items-center gap-1.5"><Lock className="size-3.5" />Opening a complaint requires its private access key. Rows marked SYNTHETIC DEMO DATA are demonstration records, not genuine ABT CPD complaints; use "Raised on CauseLine" to see only real submissions.</p>
      </div>
    </div>
  );
}
