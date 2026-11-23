import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Lock, PencilLine, Send, ShieldCheck, Trash2 } from "lucide-react";
import { api, ApiError, uploadWithProgress } from "../../services/api";
import { Banner, Button } from "../../components/ui/primitives";
import { Field, Input, Select, Textarea } from "../../components/ui/forms";
import { Stepper } from "../../components/ui/Stepper";
import { complaintSignature, findBySignature, keyFor, newSubmissionToken, saveComplaint, type SavedComplaint } from "../../utils/localComplaints";
import { cx, fmtDateTime } from "../../utils/format";

const today = () => new Date().toISOString().slice(0, 10);
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXT = /\.(jpe?g|png|webp)$/i;
const SEVERITY = [{ value: "Routine", label: "Routine - quality issue, no risk" }, { value: "Major", label: "Major - product unusable" }, { value: "Critical", label: "Critical - possible safety risk or injury" }];

const schema = z.object({
  customer_name: z.string().trim().min(2, "Enter your name").max(120),
  organisation: z.string().trim().max(160).optional(),
  email: z.string().trim().email("Enter a valid email address").optional().or(z.literal("")),
  product_name: z.string().trim().min(2, "Enter the product name or code").max(200),
  batch_id: z.string().trim().max(40).optional(),
  complaint_date: z.string().min(1, "Enter the date").refine((d) => d <= today(), "The date cannot be in the future"),
  description: z.string().trim().min(20, "Describe the problem in at least 20 characters").max(5000),
  severity: z.string().optional(),
  additional_info: z.string().trim().max(2000).optional(),
  website: z.string().optional(),
});
type F = z.infer<typeof schema>;
type Img = { file: File; url: string; error?: string };

const STEPS = ["About you", "Product and problem", "Photos", "Review and submit"];
const STEP_FIELDS: (keyof F)[][] = [["customer_name", "organisation", "email"], ["product_name", "batch_id", "complaint_date", "severity", "description", "additional_info"], [], []];

export default function RaiseComplaint() {
  const nav = useNavigate();
  const meta = useQuery({ queryKey: ["public-meta"], queryFn: () => api.get<{ max_images: number; max_image_mb: number }>("/api/public/meta"), staleTime: 300_000 });
  const maxImages = meta.data?.max_images ?? 6, maxMb = meta.data?.max_image_mb ?? 5;
  const products = useQuery({ queryKey: ["public-products"], queryFn: () => api.get<{ products: string[] }>("/api/public/products"), staleTime: 600_000 });
  const [step, setStep] = useState(0);
  const [images, setImages] = useState<Img[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; prior?: SavedComplaint } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const token = useRef(newSubmissionToken());   // one per form session: a resubmission of this form is rejected server-side
  const inFlight = useRef(false);               // blocks a second submit while the first is still running
  const confirmedResend = useRef(false);
  const { register, handleSubmit, setError, trigger, getValues, setFocus, formState: { errors, isSubmitting } } =
    useForm<F>({ resolver: zodResolver(schema), defaultValues: { complaint_date: today(), website: "" }, mode: "onBlur" });
  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL(i.url)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } headingRef.current?.focus(); }, [step]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setServerError(null);
    const next = [...images];
    for (const f of Array.from(list)) {
      if (next.length >= maxImages) { setServerError(`You can attach up to ${maxImages} photos.`); break; }
      const error = !TYPES.includes(f.type) && !EXT.test(f.name) ? "Only JPG, PNG or WEBP" : f.size > maxMb * 1024 * 1024 ? `Larger than ${maxMb} MB` : f.size === 0 ? "Empty file" : undefined;
      next.push({ file: f, url: URL.createObjectURL(f), error });
    }
    setImages(next);
    if (fileRef.current) fileRef.current.value = "";
  };
  const remove = (i: number) => { URL.revokeObjectURL(images[i].url); setImages(images.filter((_, j) => j !== i)); };
  const badImages = images.filter((i) => i.error).length;

  const next = async () => {
    setServerError(null);
    if (step === 2 && badImages) return setServerError("Remove the photos marked with a problem before continuing.");
    const fields = STEP_FIELDS[step];
    if (fields.length && !(await trigger(fields, { shouldFocus: true }))) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => { setServerError(null); setStep((s) => Math.max(0, s - 1)); };
  const goTo = (s: number) => { setServerError(null); setStep(s); };

  const onSubmit = async (v: F) => {
    if (inFlight.current) return;
    setServerError(null);
    if (badImages) { setStep(2); return setServerError("Remove the photos marked with a problem before submitting."); }
    const sig = complaintSignature(v.product_name, v.description);
    const prior = findBySignature(sig);
    if (prior && !confirmedResend.current) return setDuplicate({ id: prior.id, prior });
    inFlight.current = true;
    const fd = new FormData();
    Object.entries(v).forEach(([k, x]) => { if (x) fd.append(k, String(x)); });
    fd.append("submission_token", token.current);
    images.forEach((i) => fd.append("images", i.file, i.file.name));
    setProgress(0);
    try {
      const r = await uploadWithProgress<{ complaint_id: string; access_key: string; analysis_status: string }>("/api/public/complaints", fd, setProgress);
      saveComplaint({ id: r.complaint_id, key: r.access_key, product: v.product_name, at: new Date().toISOString(), sig });
      nav(`/complaint/${r.complaint_id}?new=1#key=${encodeURIComponent(r.access_key)}`);
    } catch (e) {
      inFlight.current = false;
      setProgress(null);
      if (e instanceof ApiError && e.status === 409) {
        const id = e.message.match(/CL-\d{4}-\d{6}/)?.[0];
        if (id) return setDuplicate({ id });
      }
      if (e instanceof ApiError) {
        const map: Record<string, [keyof F, number]> = { customer_name: ["customer_name", 0], email: ["email", 0], description: ["description", 1], product_name: ["product_name", 1], complaint_date: ["complaint_date", 1] };
        const hit = e.fieldErrors.filter((f) => map[f.field]);
        hit.forEach((f) => setError(map[f.field][0], { message: f.message }));
        if (hit.length) { setStep(map[hit[0].field][1]); setTimeout(() => setFocus(map[hit[0].field][0]), 50); }
        setServerError(e.fieldErrors.length ? "Please correct the highlighted fields." : e.message);
      } else setServerError("Something went wrong. Your complaint was not sent - please try again.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const v = getValues();
  const sev = SEVERITY.find((s) => s.value === v.severity)?.label ?? "Not sure";
  const card = "rounded-[var(--radius-card)] border border-line bg-surface p-6 space-y-4";
  const StepHeading = ({ i, children }: { i: number; children: React.ReactNode }) => <h2 ref={i === step ? headingRef : undefined} tabIndex={-1} className="font-semibold outline-none">{children}</h2>;
  const ReviewRow = ({ label, value }: { label: string; value?: string | null }) => (
    <div className="grid grid-cols-[minmax(0,140px)_1fr] gap-3 py-1.5 text-[13px]"><dt className="text-muted">{label}</dt><dd className="text-ink-2 whitespace-pre-wrap break-words min-w-0">{value || <span className="text-faint">Not given</span>}</dd></div>
  );
  const EditLink = ({ to }: { to: number }) => <button type="button" onClick={() => goTo(to)} className="inline-flex items-center gap-1 text-[12px] text-link hover:underline"><PencilLine className="size-3.5" />Edit</button>;

  return (
    <div className="bg-canvas">
      <div className="bg-graphite-950 grid-texture text-white pt-28 pb-12">
        <div className="max-w-[1200px] mx-auto px-5">
          <p className="overline text-petrol-400">Raise a complaint</p>
          <h1 className="mt-2 text-[36px] leading-[44px] max-md:text-[28px] max-md:leading-9 font-semibold tracking-[-0.01em]">Tell us what went wrong</h1>
          <p className="mt-3 text-graphite-300 max-w-2xl">No account needed. You will get a reference number straight away, and our AI will suggest a category and show similar past complaints. A person from the quality team reviews every complaint.</p>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-5 py-12 grid gap-8 lg:grid-cols-12">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="lg:col-span-8 space-y-5 min-w-0" aria-label="Complaint form">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4">
            <Stepper steps={STEPS} current={step} label="Complaint form progress" />
            <div className="sm:hidden mt-2 h-1.5 rounded-full bg-surface-hover overflow-hidden" aria-hidden><div className="h-full bg-primary transition-[width]" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
          </div>
          {serverError && <Banner tone="bad">{serverError}</Banner>}
          {duplicate && (
            <Banner tone="warn" title={duplicate.prior ? "You have already sent this complaint" : "This complaint was already submitted"}
              action={<div className="flex flex-col gap-1.5 shrink-0">
                <Link to={keyFor(duplicate.id) ? `/complaint/${duplicate.id}#key=${encodeURIComponent(keyFor(duplicate.id)!)}` : `/track?id=${duplicate.id}`} className="h-8 px-3 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-line-strong bg-surface text-[13px] font-medium hover:bg-surface-hover">Open {duplicate.id}</Link>
                {duplicate.prior && <Button type="button" size="sm" variant="ghost" onClick={() => { confirmedResend.current = true; setDuplicate(null); handleSubmit(onSubmit)(); }}>Send as a new complaint</Button>}
              </div>}>
              {duplicate.prior
                ? <>The same product and description were submitted from this device as <b className="font-mono">{duplicate.id}</b> on {fmtDateTime(duplicate.prior.at)}. Open it to follow its progress, or send this as a separate complaint if it is a new incident.</>
                : <>It is recorded as <b className="font-mono">{duplicate.id}</b> and was not created a second time. Use the reference and access key you received to follow it.</>}
            </Banner>
          )}

          <section className={cx(card, step !== 0 && "hidden")} aria-label="About you">
            <StepHeading i={0}>About you</StepHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" required htmlFor="customer_name" error={errors.customer_name?.message}><Input id="customer_name" autoComplete="name" invalid={!!errors.customer_name} {...register("customer_name")} /></Field>
              <Field label="Organisation" optional htmlFor="organisation" help="If you are complaining on behalf of a business"><Input id="organisation" autoComplete="organization" {...register("organisation")} /></Field>
              <Field label="Email" optional htmlFor="email" error={errors.email?.message} help="So the quality team can contact you if needed"><Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register("email")} /></Field>
            </div>
          </section>

          <section className={cx(card, step !== 1 && "hidden")} aria-label="The product and the problem">
            <StepHeading i={1}>The product and the problem</StepHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name or code" required htmlFor="product_name" error={errors.product_name?.message} help="Start typing to pick from our products">
                <Input id="product_name" list="product-options" autoComplete="off" invalid={!!errors.product_name} {...register("product_name")} />
                <datalist id="product-options">{products.data?.products.map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="Batch or lot number" optional htmlFor="batch_id" help="Printed on the pack, if you have it"><Input id="batch_id" {...register("batch_id")} /></Field>
              <Field label="When did it happen?" required htmlFor="complaint_date" error={errors.complaint_date?.message}><Input id="complaint_date" type="date" max={today()} invalid={!!errors.complaint_date} {...register("complaint_date")} /></Field>
              <Field label="How serious is it?" optional htmlFor="severity" help="Your own assessment">
                <Select id="severity" placeholder="Not sure" options={SEVERITY} {...register("severity")} />
              </Field>
            </div>
            <Field label="What happened?" required htmlFor="description" error={errors.description?.message} help="Describe the problem in your own words: what you found, where, and anything unusual about the pack.">
              <Textarea id="description" rows={6} invalid={!!errors.description} {...register("description")} />
            </Field>
            <Field label="Anything else?" optional htmlFor="additional_info" help="Where you bought it, storage conditions, whether anyone was unwell."><Textarea id="additional_info" rows={3} {...register("additional_info")} /></Field>
          </section>

          <section className={cx("rounded-[var(--radius-card)] border border-line bg-surface p-6", step !== 2 && "hidden")} aria-label="Photos">
            <StepHeading i={2}>Photos <span className="text-[12px] font-normal text-faint">optional</span></StepHeading>
            <p className="text-[13px] text-muted mt-1">Up to {maxImages} photos · JPG, PNG or WEBP · {maxMb} MB each. Photos are stored as evidence for the quality team; the AI does not analyse images. Location data is removed from the copy anyone sees.</p>
            <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
              className={cx("mt-4 rounded-[var(--radius-card)] border-2 border-dashed p-6 text-center transition-colors", drag ? "border-petrol-500 bg-primary-tint" : "border-line-strong")}>
              <ImagePlus className="size-7 mx-auto text-muted" aria-hidden />
              <p className="mt-2 text-[13px] text-ink-2">Drag photos here, or</p>
              <div className="mt-2 flex justify-center gap-2 flex-wrap">
                <Button type="button" variant="secondary" size="sm" disabled={images.length >= maxImages} onClick={() => fileRef.current?.click()}>Choose photos</Button>
                <label className="sm:hidden h-8 px-3 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-line-strong bg-surface text-[13px] font-medium cursor-pointer">
                  <Camera className="size-4" />Take photo<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
                </label>
              </div>
              <input ref={fileRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose photos" onChange={(e) => addFiles(e.target.files)} />
              <p className="mt-2 text-[12px] text-muted num" aria-live="polite">{images.length} of {maxImages} selected</p>
            </div>
            {images.length > 0 && (
              <ul className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3" aria-label="Selected photos">
                {images.map((im, i) => (
                  <li key={im.url} className={cx("relative rounded-[var(--radius-card)] border overflow-hidden bg-surface-2", im.error ? "border-[var(--bad-fg)]" : "border-line")}>
                    <img src={im.url} alt={`Selected photo ${i + 1}: ${im.file.name}`} className="h-32 w-full object-cover" />
                    <div className="p-2 text-[11px]">
                      <div className="truncate text-ink-2" title={im.file.name}>{im.file.name}</div>
                      <div className={im.error ? "text-[var(--bad-fg)] font-medium" : "text-muted"}>{im.error ?? `${(im.file.size / 1024 / 1024).toFixed(1)} MB`}</div>
                    </div>
                    <button type="button" onClick={() => remove(i)} aria-label={`Remove ${im.file.name}`} className="absolute top-1.5 right-1.5 size-8 grid place-items-center rounded-full bg-graphite-950/70 text-white hover:bg-graphite-950"><Trash2 className="size-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {step === 3 && (
            <section className={card} aria-label="Review your complaint">
              <StepHeading i={3}>Check your complaint before sending</StepHeading>
              <div>
                <div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold text-ink">About you</h3><EditLink to={0} /></div>
                <dl className="divide-y divide-line"><ReviewRow label="Name" value={v.customer_name} /><ReviewRow label="Organisation" value={v.organisation} /><ReviewRow label="Email" value={v.email} /></dl>
              </div>
              <div className="border-t border-line pt-3">
                <div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold text-ink">Product and problem</h3><EditLink to={1} /></div>
                <dl className="divide-y divide-line">
                  <ReviewRow label="Product" value={v.product_name} /><ReviewRow label="Batch / lot" value={v.batch_id} /><ReviewRow label="Date of problem" value={v.complaint_date} />
                  <ReviewRow label="Severity" value={sev} /><ReviewRow label="What happened" value={v.description} /><ReviewRow label="Anything else" value={v.additional_info} />
                </dl>
              </div>
              <div className="border-t border-line pt-3">
                <div className="flex items-center justify-between"><h3 className="text-[13px] font-semibold text-ink">Photos ({images.length})</h3><EditLink to={2} /></div>
                {images.length ? <ul className="mt-2 flex flex-wrap gap-2">{images.map((im, i) => <li key={im.url}><img src={im.url} alt={`Photo ${i + 1} to be sent: ${im.file.name}`} className="size-16 rounded object-cover border border-line" /></li>)}</ul>
                  : <p className="text-[13px] text-faint mt-1">No photos attached.</p>}
              </div>
              <p className="text-[12px] text-muted border-t border-line pt-3">When you send this, you get a reference number and a private access key. The AI then suggests a category - a suggestion only, reviewed by the quality team.</p>
            </section>
          )}

          <input type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden {...register("website")} />
          {progress !== null && (
            <div role="status" aria-live="polite">
              <div className="flex justify-between text-[13px] mb-1"><span>{progress < 100 ? "Uploading…" : "Saving and analysing your complaint…"}</span><span className="num">{progress}%</span></div>
              <div className="h-2 rounded-full bg-surface-hover overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 max-sm:flex-col-reverse max-sm:items-stretch">
            {step > 0 ? <Button type="button" variant="secondary" icon={<ArrowLeft className="size-4" />} onClick={back} disabled={progress !== null}>Back</Button> : <span />}
            {step < STEPS.length - 1
              // distinct keys: React must not reuse the Next <button> as the submit button, or the click that reveals
              // the review step would also submit the form
              ? <Button key="next" type="button" onClick={next} className="max-sm:w-full">Next<ArrowRight className="size-4" /></Button>
              : <Button key="submit" type="submit" loading={isSubmitting || progress !== null} icon={<Send className="size-4" />} className="max-sm:w-full">Submit complaint</Button>}
          </div>
        </form>
        <aside className="lg:col-span-4 space-y-4">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="font-semibold">What happens next</h2>
            <ol className="mt-3 space-y-3 text-[14px] text-ink-2 list-decimal pl-5">
              <li>Your complaint is saved and you get a reference number and a private access key.</li>
              <li>Our AI suggests a category, checks for food-safety keywords and finds similar past complaints.</li>
              <li>The quality team investigates. Confirmed findings appear on your complaint page.</li>
            </ol>
          </div>
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 flex gap-3">
            <Lock className="size-5 text-link shrink-0" />
            <p className="text-[13px] text-ink-2">Only you (with your access key) and authorised CauseLine staff can see your name, contact details, description and photos. The public register shows only the reference, date, product, category and status.</p>
          </div>
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 flex gap-3">
            <ShieldCheck className="size-5 text-link shrink-0" />
            <p className="text-[13px] text-ink-2">If someone became ill, seek medical advice first. Mark the complaint as Critical so it is prioritised.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
