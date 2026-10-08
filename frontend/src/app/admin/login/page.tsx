"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleNotch, faEnvelope, faEye, faEyeSlash, faUnlockKeyhole } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "@/store/auth";
import { apiErrorMessage } from "@/lib/api";
import BrandLogo from "@/components/layout/BrandLogo";

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(8, "Password must be at least 8 characters"),
  remember: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const login = useAuthStore((s) => s.login);
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: false },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await login(values);
      // only internal redirects (prevents open-redirect via ?next=)
      router.replace(next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
    } catch (e) {
      setServerError(apiErrorMessage(e, "Unable to sign in. Please try again."));
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-200 px-4 py-10">
      <section className="card w-full max-w-[450px] p-6 !shadow-volt sm:p-10" aria-labelledby="login-title">
        <div className="mb-8 text-center">
          <BrandLogo size={64} className="mx-auto mb-4" title="Lovosis Detection" />
          <h1 id="login-title" className="text-2xl font-semibold text-primary">Sign in to our platform</h1>
          <p className="text-muted mt-1">Lovosis Detection · Admin Panel</p>
        </div>

        {serverError && (
          <div id="login-error" role="alert" className="alert alert-danger mb-4">{serverError}</div>
        )}

        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="form-label">Your Email</label>
            <div className="input-group">
              <span className="input-icon"><FontAwesomeIcon icon={faEnvelope} /></span>
              <input id="login-email" type="email" autoComplete="username" autoFocus
                placeholder="example@company.com" aria-invalid={!!errors.email}
                className={`form-control ${errors.email ? "is-invalid" : ""}`} {...register("email")} />
            </div>
            {errors.email && <p className="invalid-feedback">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="login-password" className="form-label">Your Password</label>
            <div className="input-group">
              <span className="input-icon"><FontAwesomeIcon icon={faUnlockKeyhole} /></span>
              <input id="login-password" type={showPw ? "text" : "password"} autoComplete="current-password"
                placeholder="Password" aria-invalid={!!errors.password}
                className={`form-control !pr-11 ${errors.password ? "is-invalid" : ""}`} {...register("password")} />
              <button id="login-toggle-password" type="button" className="input-action"
                onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>
                <FontAwesomeIcon icon={showPw ? faEyeSlash : faEye} />
              </button>
            </div>
            {errors.password && <p className="invalid-feedback">{errors.password.message}</p>}
          </div>

          <div className="flex items-center justify-between">
            <label className="form-check">
              <input id="login-remember" type="checkbox" {...register("remember")} /> Remember me
            </label>
            <span className="text-sm font-semibold text-gray-700" title="Contact your super admin to reset your password">
              Lost password?
            </span>
          </div>

          <button id="login-submit" type="submit" disabled={isSubmitting} className="btn btn-primary h-11 w-full">
            {isSubmitting ? (<><FontAwesomeIcon icon={faCircleNotch} spin /> Signing in…</>) : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
