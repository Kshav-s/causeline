import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarCheck, CheckCircle2, Download, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../../services/api";
import { Banner, Button } from "../../components/ui/primitives";
import { Field, Input, Select, Textarea } from "../../components/ui/forms";

const SLOTS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"];
const today = () => new Date().toISOString().slice(0, 10);

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  organisation: z.string().trim().min(2, "Enter your organisation").max(160),
  job_role: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Enter a valid work email"),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{6,40}$/, "Use digits, spaces, + ( ) -").optional().or(z.literal("")),
  preferred_date: z.string().min(1, "Choose a date").refine((d) => d > today(), "Choose a date after today")
    .refine((d) => { const w = new Date(`${d}T00:00:00`).getDay(); return w !== 0 && w !== 6; }, "Demonstrations run on weekdays only"),
  time_slot: z.string().min(1, "Choose a time"),
  timezone: z.string().min(2),
  purpose: z.string().trim().min(20, "Tell us a little more (at least 20 characters)").max(1000),
  consent: z.boolean().refine((v) => v, "Consent is required to process your request"),
  website: z.string().optional(), // honeypot
});
type Form = z.infer<typeof schema>;
type Confirmation = { reference: string; preferred_date: string; time_slot: string; timezone: string; full_name: string; organisation: string; email: string };

function ics(c: Confirmation) {
  const [h, m] = c.time_slot.split(":");
  const d = c.preferred_date.replace(/-/g, "");
  const end = String(Number(h) + 1).padStart(2, "0");
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CauseLine//Demo//EN", "BEGIN:VEVENT", `UID:${c.reference}@causeline`, `DTSTART:${d}T${h}${m}00`, `DTEND:${d}T${end}${m}00`,
    `SUMMARY:CauseLine demonstration (${c.reference})`, `DESCRIPTION:Requested demo - time is ${c.timezone}. We will confirm by email.`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
}

export default function Demo() {
  const [done, setDone] = useState<Confirmation | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema), defaultValues: { timezone: tz, consent: false, time_slot: "", website: "" }, mode: "onBlur",
  });
  const onSubmit = async (v: Form) => {
    setServerError(null);
    try {
      setDone(await api.post<Confirmation>("/api/demo-bookings", { ...v, phone: v.phone || null, job_role: v.job_role || null }));
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ApiError) {
        e.fieldErrors.forEach((f) => setError(f.field as keyof Form, { message: f.message }));
        setServerError(e.fieldErrors.length ? "Please correct the highlighted fields." : e.message);
      } else setServerError("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="bg-canvas">
      <div className="bg-graphite-950 grid-texture text-white pt-28 pb-12">
        <div className="max-w-[1200px] mx-auto px-5">
          <p className="overline text-petrol-400">Request a demo</p>
          <h1 className="mt-2 text-[36px] leading-[44px] max-md:text-[28px] max-md:leading-9 font-semibold tracking-[-0.01em]">Book a CauseLine walkthrough</h1>
          <p className="mt-3 text-graphite-300 max-w-2xl">Tell us when suits you and what you want to see. This request is stored for our team only; it is never processed by any analytics model.</p>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-5 py-12 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          {done ? (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6" role="status">
              <CheckCircle2 className="size-8" style={{ color: "var(--ok-fg)" }} />
              <h2 className="mt-3 text-xl font-semibold">Request received</h2>
              <p className="mt-1 text-ink-2">Thank you, {done.full_name}. We will confirm the session by email at <b>{done.email}</b>.</p>
              <dl className="mt-5 grid sm:grid-cols-2 gap-3 text-[14px]">
                <div><dt className="text-muted text-[12px]">Booking reference</dt><dd className="font-mono">{done.reference}</dd></div>
                <div><dt className="text-muted text-[12px]">Organisation</dt><dd>{done.organisation}</dd></div>
                <div><dt className="text-muted text-[12px]">Requested slot</dt><dd>{new Date(`${done.preferred_date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {done.time_slot}</dd></div>
                <div><dt className="text-muted text-[12px]">Time zone</dt><dd>{done.timezone}</dd></div>
              </dl>
              <div className="mt-6 flex flex-wrap gap-2">
                <a href={ics(done)} download={`causeline-demo-${done.reference}.ics`} className="h-9 px-4 inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface hover:bg-surface-hover text-sm font-medium"><Download className="size-4" />Add to calendar</a>
                <Link to="/" className="h-9 px-4 inline-flex items-center rounded-[var(--radius-control)] text-sm font-medium text-link hover:underline">Back to home</Link>
              </div>
              <p className="mt-4 text-[12px] text-muted">The slot is a request until we confirm it.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="rounded-[var(--radius-card)] border border-line bg-surface p-6 space-y-5" aria-label="Demo request form">
              {serverError && <Banner tone="bad">{serverError}</Banner>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" required htmlFor="full_name" error={errors.full_name?.message}><Input id="full_name" autoComplete="name" invalid={!!errors.full_name} {...register("full_name")} /></Field>
                <Field label="Organisation" required htmlFor="organisation" error={errors.organisation?.message}><Input id="organisation" autoComplete="organization" invalid={!!errors.organisation} {...register("organisation")} /></Field>
                <Field label="Role" optional htmlFor="job_role"><Input id="job_role" autoComplete="organization-title" {...register("job_role")} /></Field>
                <Field label="Work email" required htmlFor="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register("email")} /></Field>
                <Field label="Phone" optional htmlFor="phone" error={errors.phone?.message}><Input id="phone" type="tel" autoComplete="tel" invalid={!!errors.phone} {...register("phone")} /></Field>
                <Field label="Time zone" required htmlFor="timezone" help="Detected from your browser; edit if needed."><Input id="timezone" {...register("timezone")} /></Field>
                <Field label="Preferred date" required htmlFor="preferred_date" error={errors.preferred_date?.message} help="Weekdays only."><Input id="preferred_date" type="date" min={today()} invalid={!!errors.preferred_date} {...register("preferred_date")} /></Field>
                <Field label="Preferred time" required htmlFor="time_slot" error={errors.time_slot?.message}><Select id="time_slot" placeholder="Select a time" options={SLOTS} invalid={!!errors.time_slot} {...register("time_slot")} /></Field>
              </div>
              <Field label="What would you like to see?" required htmlFor="purpose" error={errors.purpose?.message} help="For example: complaint trends for two plants, CAPA follow-up, importing our Excel files.">
                <Textarea id="purpose" rows={4} invalid={!!errors.purpose} {...register("purpose")} />
              </Field>
              <input type="text" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden {...register("website")} />
              <div>
                <label className="flex items-start gap-2 text-[13px] text-ink-2">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" {...register("consent")} aria-invalid={!!errors.consent} />
                  I agree that CauseLine may store these details to arrange and follow up on this demonstration.
                </label>
                {errors.consent && <p className="mt-1 text-[12px] text-[var(--bad-fg)]" role="alert">{errors.consent.message}</p>}
              </div>
              <Button type="submit" loading={isSubmitting} icon={<CalendarCheck className="size-4" />}>Request demo</Button>
            </form>
          )}
        </div>
        <aside className="lg:col-span-5 space-y-4">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
            <h2 className="font-semibold">What to expect</h2>
            <ol className="mt-3 space-y-3 text-[14px] text-ink-2 list-decimal pl-5">
              <li>We confirm your slot by email.</li>
              <li>A 45-minute walkthrough of complaints, AI analysis, root cause and CAPA effectiveness on the synthetic demo dataset.</li>
              <li>We discuss what your own files contain and what the models can and cannot support.</li>
            </ol>
          </div>
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 flex gap-3">
            <ShieldCheck className="size-5 text-link shrink-0" />
            <p className="text-[13px] text-ink-2">Your details are used only to arrange this demonstration. They are kept separate from complaint data and are never sent to any model or external service.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
