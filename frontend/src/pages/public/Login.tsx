import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useAuth } from "../../hooks/auth";
import { ApiError } from "../../services/api";
import { Logo } from "../../components/domain/Logo";
import { Banner, Button } from "../../components/ui/primitives";
import { Field, Input } from "../../components/ui/forms";

const schema = z.object({ email: z.string().trim().min(3, "Enter your email"), password: z.string().min(1, "Enter your password") });

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const next = sp.get("next");
  const safeNext = next && next.startsWith("/app") ? next : "/app";
  if (user) return <Navigate to={safeNext} replace />;
  return (
    <div className="min-h-full grid md:grid-cols-[1fr_1fr] bg-canvas">
      <div className="max-md:hidden bg-graphite-950 grid-texture text-white p-10 flex flex-col justify-between">
        <Link to="/"><Logo inverse /></Link>
        <div>
          <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] max-w-md">Complaint evidence, causes and CAPA follow-up in one trail.</h1>
          <p className="mt-3 text-graphite-300 max-w-md">Every value is labelled as recorded fact, rule-based calculation or model output.</p>
        </div>
        <p className="text-[12px] text-graphite-500">Authorised ABT CPD users only. Access is logged.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="md:hidden mb-8"><Link to="/"><Logo /></Link></div>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="text-muted mt-1">Use the account provided by your administrator.</p>
          <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit(async (v) => {
            setError(null);
            try { await login(v.email, v.password); nav(safeNext, { replace: true }); }
            catch (e) { setError(e instanceof ApiError ? e.message : "Sign-in failed. Please try again."); }
          })}>
            {error && <Banner tone="bad">{error}</Banner>}
            <Field label="Email" htmlFor="email" error={errors.email?.message}><Input id="email" type="email" autoComplete="username" invalid={!!errors.email} {...register("email")} /></Field>
            <Field label="Password" htmlFor="password" error={errors.password?.message}>
              <div className="relative">
                <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" invalid={!!errors.password} className="pr-10" {...register("password")} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 -translate-y-1/2 size-8 grid place-items-center text-muted hover:text-ink">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Button type="submit" className="w-full" loading={isSubmitting} icon={<LogIn className="size-4" />}>Sign in</Button>
          </form>
          <p className="mt-6 text-[13px] text-muted">No account? <Link to="/demo" className="text-link hover:underline">Request a demo</Link></p>
        </div>
      </div>
    </div>
  );
}
