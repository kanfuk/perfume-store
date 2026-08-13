"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { requestAdminPasswordRecovery } from "@/lib/admin/passwordRecovery";
import { appInfo } from "@/lib/app-info";
import { getAdminUrl } from "@/lib/public-url";

type AdminLoginFormProps = {
  nextPath: string;
  defaultEmail: string;
};

export function AdminLoginForm({
  nextPath,
  defaultEmail
}: AdminLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    try {
      setSubmitting(true);
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) throw new Error("Correo o contraseña incorrectos.");

      router.push(nextPath);
      router.refresh();
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible iniciar sesión."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoveryRequest = async () => {
    if (recoverySubmitting) {
      return;
    }

    setRecoveryMessage("");
    setRecoverySubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const result = await requestAdminPasswordRecovery(
        email,
        supabase.auth,
        getAdminUrl("/admin/set-password")
      );
      setRecoveryMessage(result.message);
    } finally {
      setRecoverySubmitting(false);
    }
  };

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="w-full space-y-6"
    >
      <div className="space-y-3">
        <span className="inline-flex text-xs font-semibold uppercase tracking-[0.18em] text-[#B88B58]">
          Smellme.cl
        </span>
        <p className="text-sm font-medium text-[#8A6036]">{appInfo.tagline}</p>
        <h1 className="text-3xl font-bold leading-tight text-[#191714] sm:text-4xl">
          Administración
        </h1>
        <p className="copy-justified text-sm leading-6 text-[#6B6258]">
          Inicia sesión para administrar tu catálogo de fragancias.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#191714]">Correo admin</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="app-input w-full px-4 outline-none"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#191714]">Clave admin</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="app-input w-full px-4 outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="app-button-primary w-full px-4 py-3 font-semibold transition"
      >
        {submitting ? "Ingresando..." : "Entrar al panel"}
      </button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="border-t border-[#DDD0C1] pt-4 text-center">
        <button
          type="button"
          onClick={handleRecoveryRequest}
          disabled={recoverySubmitting}
          className="text-sm font-medium text-[#8A6036] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[#D8BEA2]"
        >
          {recoverySubmitting ? "Enviando..." : "Recuperar contraseña"}
        </button>
        {recoveryMessage ? (
          <p className="mt-2 text-sm text-[#6B6258]">{recoveryMessage}</p>
        ) : null}
      </div>
    </form>
  );
}
