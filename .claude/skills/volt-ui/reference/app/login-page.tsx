// @ts-nocheck — reference only (no node_modules here). REMOVE this line when copying into the real app.
// Reference: frontend/src/app/admin/login/page.tsx
// Volt "Sign in to our platform" page. Spec: .claude/docs/design-system.md §6 + admin-auth.md §7
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faUnlockAlt, faEye, faEyeSlash, faCircleNotch } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "@/store/auth";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  remember: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const login = useAuthStore((s) => s.login);
  const [showPw, setShowPw] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { remember: false } });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await login(values);
      // only allow internal redirects
      router.replace(next && next.startsWith("/admin") ? next : "/admin");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setServerError(msg ?? "Unable to sign in. Please try again.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-200 px-4 py-10">
      <section className="card w-full max-w-[450px] !shadow-volt p-6 sm:p-10">
        <div className="mb-8 text-center">
          {/* <Image src="/logo.svg" width={40} height={40} alt="Logo" className="mx-auto mb-4" /> */}
          <h1 className="text-2xl font-semibold text-primary">Sign in to our platform</h1>
        </div>

        {serverError && <div role="alert" className="alert alert-danger mb-4">{serverError}</div>}

        <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="form-label">Your Email</label>
            <div className="input-group">
              <span className="input-icon"><FontAwesomeIcon icon={faEnvelope} /></span>
              <input id="login-email" type="email" autoComplete="username" autoFocus
                placeholder="example@company.com"
                className={`form-control ${errors.email ? "is-invalid" : ""}`} {...register("email")} />
            </div>
            {errors.email && <p className="invalid-feedback">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="login-password" className="form-label">Your Password</label>
            <div className="input-group">
              <span className="input-icon"><FontAwesomeIcon icon={faUnlockAlt} /></span>
              <input id="login-password" type={showPw ? "text" : "password"} autoComplete="current-password"
                placeholder="Password"
                className={`form-control !pr-11 ${errors.password ? "is-invalid" : ""}`} {...register("password")} />
              <button type="button" className="input-action" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}>
                <FontAwesomeIcon icon={showPw ? faEyeSlash : faEye} />
              </button>
            </div>
            {errors.password && <p className="invalid-feedback">{errors.password.message}</p>}
          </div>

          <div className="flex items-center justify-between">
            <label className="form-check">
              <input id="login-remember" type="checkbox" {...register("remember")} /> Remember me
            </label>
            <a href="#" className="text-sm font-semibold text-primary hover:underline">Lost password?</a>
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
