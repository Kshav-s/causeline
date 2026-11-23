import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api, ApiError } from "../../services/api";
import { useCapabilities } from "../../hooks/auth";
import { Banner, Button, Card, PageHeader } from "../../components/ui/primitives";
import { Field, Input, Select, Textarea } from "../../components/ui/forms";
import { useToast } from "../../components/ui/overlays";
import type { Complaint } from "../../types/api";

const today = () => new Date().toISOString().slice(0, 10);
const opt = z.string().trim().max(200).optional().or(z.literal(""));
const schema = z.object({
  complaint_received_date: z.string().min(1, "Enter the received date").refine((d) => d <= today(), "Cannot be in the future"),
  event_date: z.string().optional(),
  complaint_channel: opt, customer_name: opt, customer_segment: opt, customer_region: opt,
  product_name: z.string().trim().min(2, "Enter the product").max(200),
  food_family: opt, product_category: opt, batch_id: z.string().trim().max(40).optional(),
  complaint_summary: z.string().trim().max(300).optional(),
  complaint_description: z.string().trim().min(10, "Describe the complaint (at least 10 characters)").max(5000),
  complaint_category: opt,
  reported_units_affected: z.string().optional().refine((v) => !v || /^\d+$/.test(v), "Whole number"),
  complaint_severity: z.string().optional(),
  owner: opt,
});
type F = z.infer<typeof schema>;
type Opts = { products: string[]; categories: string[]; food_families: string[]; channels: string[]; segments: string[]; regions: string[] };

export default function ComplaintNew() {
  const nav = useNavigate();
  const toast = useToast();
  const { data: caps } = useCapabilities();
  const opts = useQuery({ queryKey: ["complaint-filters"], queryFn: () => api.get<Opts>("/api/complaints/filters"), staleTime: 300_000 });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<F>({ resolver: zodResolver(schema), defaultValues: { complaint_received_date: today() }, mode: "onBlur" });
  const errList = Object.entries(errors);

  const submit = (analyse: boolean) => handleSubmit(async (v) => {
    const body = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === "" || x === undefined ? null : x]));
    if (body.reported_units_affected) body.reported_units_affected = Number(body.reported_units_affected) as never;
    try {
      const c = await api.post<Complaint>("/api/complaints", { ...body, complaint_status: "Open" });
      toast("ok", `Complaint ${c.complaint_id} saved`);
      if (analyse) await api.post(`/api/ml/analyze/complaint/${c.complaint_id}`).catch(() => toast("bad", "Saved, but the analysis could not run."));
      nav(`/app/complaints/${c.complaint_id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        e.fieldErrors.forEach((f) => setError(f.field as keyof F, { message: f.message }));
        if (!e.fieldErrors.length) toast("bad", e.message);
      }
    }
  });

  return (
    <form noValidate onSubmit={(e) => e.preventDefault()} className="pb-24">
      <PageHeader title="New complaint" description="Recorded details only. Leave the category empty if it has not been determined - the AI analysis can suggest one for a person to confirm." />
      {errList.length > 0 && (
        <Banner tone="bad" className="mb-4" title={`${errList.length} field${errList.length > 1 ? "s need" : " needs"} attention`}>
          <ul className="list-disc pl-5">{errList.map(([k, e]) => <li key={k}><a href={`#${k}`} className="underline">{e?.message as string}</a></li>)}</ul>
        </Banner>
      )}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8 space-y-4">
          <Card title="Complaint details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Received date" required htmlFor="complaint_received_date" error={errors.complaint_received_date?.message}><Input id="complaint_received_date" type="date" max={today()} invalid={!!errors.complaint_received_date} {...register("complaint_received_date")} /></Field>
              <Field label="Event date" optional htmlFor="event_date" help="When the customer noticed the problem"><Input id="event_date" type="date" max={today()} {...register("event_date")} /></Field>
              <Field label="Channel" optional htmlFor="complaint_channel"><Select id="complaint_channel" placeholder="Select…" options={opts.data?.channels ?? []} {...register("complaint_channel")} /></Field>
              <Field label="Severity" optional htmlFor="complaint_severity"><Select id="complaint_severity" placeholder="Not yet assessed" options={["Routine", "Major", "Critical"]} {...register("complaint_severity")} /></Field>
            </div>
            <div className="mt-4 space-y-4">
              <Field label="Summary" optional htmlFor="complaint_summary"><Input id="complaint_summary" maxLength={300} {...register("complaint_summary")} /></Field>
              <Field label="Description" required htmlFor="complaint_description" error={errors.complaint_description?.message} help="What the customer reported, in their words where possible.">
                <Textarea id="complaint_description" rows={6} invalid={!!errors.complaint_description} {...register("complaint_description")} />
              </Field>
            </div>
          </Card>
          <Card title="Product & batch">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product" required htmlFor="product_name" error={errors.product_name?.message}>
                <Input id="product_name" list="product-list" invalid={!!errors.product_name} {...register("product_name")} />
                <datalist id="product-list">{opts.data?.products.map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="Food family" optional htmlFor="food_family" help="Needed for root-cause hypotheses"><Select id="food_family" placeholder="Select…" options={opts.data?.food_families ?? []} {...register("food_family")} /></Field>
              <Field label="Batch / lot" optional htmlFor="batch_id"><Input id="batch_id" {...register("batch_id")} /></Field>
              <Field label="Units affected" optional htmlFor="reported_units_affected" error={errors.reported_units_affected?.message}><Input id="reported_units_affected" inputMode="numeric" {...register("reported_units_affected")} /></Field>
            </div>
          </Card>
          <Card title="Customer">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Customer" optional htmlFor="customer_name"><Input id="customer_name" {...register("customer_name")} /></Field>
              <Field label="Segment" optional htmlFor="customer_segment"><Select id="customer_segment" placeholder="Select…" options={opts.data?.segments ?? []} {...register("customer_segment")} /></Field>
              <Field label="Region" optional htmlFor="customer_region"><Select id="customer_region" placeholder="Select…" options={opts.data?.regions ?? []} {...register("customer_region")} /></Field>
            </div>
          </Card>
        </div>
        <div className="xl:col-span-4 space-y-4">
          <Card title="Classification (recorded)">
            <Field label="Complaint category" optional htmlFor="complaint_category" help="Only if already determined by a person. Otherwise leave empty.">
              <Select id="complaint_category" placeholder="Not determined" options={opts.data?.categories ?? []} {...register("complaint_category")} />
            </Field>
            <Field label="Owner" optional htmlFor="owner"><Input id="owner" {...register("owner")} /></Field>
          </Card>
          <Banner tone="info" title="What happens on save">The record is stored as manually entered. "Save & analyse" also runs the registered models; their outputs are stored separately as predictions awaiting human review.</Banner>
        </div>
      </div>
      <div className="fixed bottom-0 inset-x-0 md:left-16 lg:left-[248px] z-20 border-t border-line bg-surface/95 backdrop-blur no-print">
        <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-3 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => nav(-1)}>Cancel</Button>
          <Button variant="secondary" type="button" loading={isSubmitting} onClick={submit(false)}>Save</Button>
          {caps?.modules.ai_analysis && <Button type="button" loading={isSubmitting} onClick={submit(true)}>Save & analyse</Button>}
        </div>
      </div>
    </form>
  );
}
