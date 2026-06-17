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
      method="post"
      onSubmit={handleSubmit}
      className="w-full space-y-6 rounded-[30px] border border-[#ecd7b3] bg-white/95 p-6 shadow-soft backdrop-blur sm:p-7"
    >
      <div className="space-y-3">
        <span className="inline-flex rounded-full bg-[#f6d38a] px-3 py-1 text-sm font-semibold text-[#7a4c1f]">
          Bienvenida Pauli
        </span>
        <h1 className="text-3xl font-bold leading-tight text-[#4d1f2e] sm:text-4xl">
          Ingreso administrador
        </h1>
        <p className="copy-justified text-sm leading-6 text-[#7f5b67]">
          Bienvenida, Pauli. Logea para administrar tu tiendita con todo en orden.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#5f3041]">Correo admin</span>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-[18px] border border-[#ecd7b3] bg-[#fff7e8] px-4 py-3 text-[#5f3041] outline-none transition focus:border-[#d8a55d]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#5f3041]">Clave admin</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-[18px] border border-[#ecd7b3] bg-[#fff7e8] px-4 py-3 text-[#5f3041] outline-none transition focus:border-[#d8a55d]"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-[18px] bg-[#b47634] px-4 py-3 font-semibold text-white transition hover:bg-[#9a6228] disabled:cursor-not-allowed disabled:bg-[#d5b08c]"
      >
        {submitting ? "Ingresando..." : "Entrar al panel"}
      </button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
