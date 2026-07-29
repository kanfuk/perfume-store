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
      className="w-full space-y-6 rounded-[30px] border border-[#e3d9c8] bg-white/95 p-6 shadow-soft backdrop-blur sm:p-7"
    >
      <div className="space-y-3">
        <span className="inline-flex rounded-full bg-[#ece1c9] px-3 py-1 text-sm font-semibold text-[#6b4a26]">
          Smellme.cl
        </span>
        <h1 className="text-3xl font-bold leading-tight text-[#231f19] sm:text-4xl">
          Administración
        </h1>
        <p className="copy-justified text-sm leading-6 text-[#74695c]">
          Inicia sesión para administrar tu catálogo de fragancias.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#231f19]">Correo admin</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-[18px] border border-[#e3d9c8] bg-[#faf7f1] px-4 py-3 text-[#231f19] outline-none transition focus:border-[#9c7a45]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#231f19]">Clave admin</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-[18px] border border-[#e3d9c8] bg-[#faf7f1] px-4 py-3 text-[#231f19] outline-none transition focus:border-[#9c7a45]"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-[18px] bg-[#9c7a45] px-4 py-3 font-semibold text-white transition hover:bg-[#6b4a26] disabled:cursor-not-allowed disabled:bg-[#d9c8a0]"
      >
        {submitting ? "Ingresando..." : "Entrar al panel"}
      </button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="border-t border-[#e6f2ea] pt-4 text-center">
        <button
          type="button"
          onClick={handleRecoveryRequest}
          disabled={recoverySubmitting}
          className="text-sm font-medium text-[#6b4a26] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[#d9c8a0]"
        >
          {recoverySubmitting ? "Enviando..." : "Crear o recuperar contraseña"}
        </button>
        {recoveryMessage ? (
          <p className="mt-2 text-sm text-[#74695c]">{recoveryMessage}</p>
        ) : null}
      </div>
    </form>
  );
}
