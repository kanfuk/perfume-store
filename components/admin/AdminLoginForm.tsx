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
          : "No fue posible iniciar sesión."
      );
    } finally {
      setSubmitting(false);
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
          Bienvenida Pauli
        </span>
        <h1 className="text-3xl font-bold leading-tight text-[#1f3328] sm:text-4xl">
          Ingreso administrador
        </h1>
        <p className="copy-justified text-sm leading-6 text-[#6b7c70]">
          Bienvenida, Pauli. Inicia sesión para administrar tu tiendita con todo en orden.
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
    </form>
  );
}
