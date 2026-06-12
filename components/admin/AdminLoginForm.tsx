"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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
          : "No fue posible iniciar sesion."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-6 rounded-lg border border-border bg-panel p-6 shadow-soft"
    >
      <div className="space-y-2">
        <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-ink">
          Supabase Auth
        </span>
        <h1 className="text-3xl font-bold text-ink">Ingreso administrador</h1>
        <p className="text-sm leading-6 text-ink/75">
          Inicia sesion con tu usuario admin real. Ademas del login, el email
          debe existir y estar activo en la tabla `usuarios_admin`.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink">Correo admin</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-border bg-background px-4 py-3"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-ink">Clave admin</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-border bg-background px-4 py-3"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-white"
      >
        {submitting ? "Ingresando..." : "Entrar al panel"}
      </button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
