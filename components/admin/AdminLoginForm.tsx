"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { requestAdminPasswordRecovery } from "@/lib/admin/passwordRecovery";

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

      if (authError) {
        throw new Error(authError.message);
      }

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
        `${window.location.origin}/admin/set-password`
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
        <span className="inline-flex text-xs font-semibold uppercase tracking-[0.18em] text-[#7357ff]">
          Smellme.cl
        </span>
        <h1 className="text-3xl font-bold leading-tight text-[#111318] sm:text-4xl">
          Administración
        </h1>
        <p className="copy-justified text-sm leading-6 text-[#667085]">
          Inicia sesión para administrar tu catálogo de fragancias.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#111318]">Correo admin</span>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="app-input w-full px-4 outline-none"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#111318]">Clave admin</span>
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

      <div className="border-t border-[#e4e7ec] pt-4 text-center">
        <button
          type="button"
          onClick={handleRecoveryRequest}
          disabled={recoverySubmitting}
          className="text-sm font-medium text-[#5434e6] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[#c1b6ff]"
        >
          {recoverySubmitting ? "Enviando..." : "Crear o recuperar contraseña"}
        </button>
        {recoveryMessage ? (
          <p className="mt-2 text-sm text-[#667085]">{recoveryMessage}</p>
        ) : null}
      </div>
    </form>
  );
}
