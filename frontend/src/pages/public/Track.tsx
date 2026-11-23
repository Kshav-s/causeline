import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Search, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/primitives";
import { Field, Input } from "../../components/ui/forms";
import { forgetComplaint, savedComplaints } from "../../utils/localComplaints";
import { fmtDateTime } from "../../utils/format";

export default function Track() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [id, setId] = useState(sp.get("id") ?? "");
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState(savedComplaints());
  return (
    <div className="bg-canvas">
      <div className="bg-graphite-950 grid-texture text-white pt-28 pb-12">
        <div className="max-w-[1200px] mx-auto px-5">
          <p className="overline text-petrol-400">Track a complaint</p>
          <h1 className="mt-2 text-[36px] leading-[44px] max-md:text-[28px] font-semibold tracking-[-0.01em]">Check your complaint and its analysis</h1>
          <p className="mt-3 text-graphite-300 max-w-2xl">Enter the reference number and the private access key you received when you submitted it.</p>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-5 py-12 grid gap-8 lg:grid-cols-12">
        <form className="lg:col-span-6 rounded-[var(--radius-card)] border border-line bg-surface p-6 space-y-4" noValidate aria-label="Track complaint"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^[A-Za-z0-9._\-/]{3,40}$/.test(id.trim())) return setErr("Enter your reference, for example CL-2026-000001.");
            if (key.trim().length < 10) return setErr("Enter the access key you received.");
            nav(`/complaint/${encodeURIComponent(id.trim())}#key=${encodeURIComponent(key.trim())}`);
          }}>
          <Field label="Reference number" required htmlFor="t-id" error={err && !id ? err : undefined}><Input id="t-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="CL-2026-000001" className="font-mono" /></Field>
          <Field label="Access key" required htmlFor="t-key" error={err ?? undefined}><Input id="t-key" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" className="font-mono" /></Field>
          <Button type="submit" icon={<Search className="size-4" />}>View complaint</Button>
          <p className="text-[12px] text-muted">Lost your key? For privacy it cannot be recovered online. Raise the issue again or contact the quality team quoting your reference.</p>
        </form>
        <div className="lg:col-span-6 rounded-[var(--radius-card)] border border-line bg-surface p-6">
          <h2 className="font-semibold">Complaints raised on this device</h2>
          {mine.length ? (
            <ul className="mt-3 divide-y divide-line">
              {mine.map((c) => (
                <li key={c.id} className="py-2.5 flex items-center justify-between gap-2">
                  <Link to={`/complaint/${c.id}#key=${encodeURIComponent(c.key)}`} className="min-w-0"><div className="font-mono text-[13px] text-link hover:underline">{c.id}</div><div className="text-[12px] text-muted truncate">{c.product} · {fmtDateTime(c.at)}</div></Link>
                  <button aria-label={`Forget ${c.id} on this device`} onClick={() => { forgetComplaint(c.id); setMine(savedComplaints()); }} className="size-9 grid place-items-center rounded text-muted hover:bg-surface-hover"><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[13px] text-muted">None yet. <Link to="/raise" className="text-link hover:underline">Raise a complaint</Link>.</p>}
        </div>
      </div>
    </div>
  );
}
