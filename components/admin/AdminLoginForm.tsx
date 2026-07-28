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
      className="w-full space-y-6 rounded-[30px] border border-[#d8ebdd] bg-white/95 p-6 shadow-soft backdrop-blur sm:p-7"
    >
      <div className="space-y-3">
        <span className="inline-flex rounded-full bg-[#ddf4e5] px-3 py-1 text-sm font-semibold text-[#247a4d]">
          Perfume Store
        </span>
        <h1 className="text-3xl font-bold leading-tight text-[#1f3328] sm:text-4xl">
          Administración
        </h1>
        <p className="copy-justified text-sm leading-6 text-[#6b7c70]">
          Inicia sesión para administrar tu tienda con todo en orden.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#1f3328]">Correo admin</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-[18px] border border-[#d8ebdd] bg-[#f6fcf7] px-4 py-3 text-[#1f3328] outline-none transition focus:border-[#3fa66b]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#1f3328]">Clave admin</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-[18px] border border-[#d8ebdd] bg-[#f6fcf7] px-4 py-3 text-[#1f3328] outline-none transition focus:border-[#3fa66b]"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-[18px] bg-[#3fa66b] px-4 py-3 font-semibold text-white transition hover:bg-[#247a4d] disabled:cursor-not-allowed disabled:bg-[#a8d8b7]"
      >
        {submitting ? "Ingresando..." : "Entrar al panel"}
      </button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="border-t border-[#e6f2ea] pt-4 text-center">
        <button
          type="button"
          onClick={handleRecoveryRequest}
          disabled={recoverySubmitting}
          className="text-sm font-medium text-[#247a4d] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-[#a8d8b7]"
        >
          {recoverySubmitting ? "Enviando..." : "Crear o recuperar contraseña"}
        </button>
        {recoveryMessage ? (
          <p className="mt-2 text-sm text-[#6b7c70]">{recoveryMessage}</p>
        ) : null}
      </div>
    </form>
  );
}
