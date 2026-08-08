"use client";

import { useEffect, useState } from "react";
import { resolveAdminPasswordSession } from "@/lib/admin-invite-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { validateAdminNewPassword } from "@/lib/validators";

const REDIRECT_DELAY_MS = 1800;

type Status = "checking" | "no-session" | "ready" | "success";

function clearUrlFragment() {
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

export function AdminSetPasswordForm() {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;

    void resolveAdminPasswordSession(
      supabase.auth,
      window.location.hash,
      clearUrlFragment
    ).then((sessionReady) => {
      if (active) setStatus(sessionReady ? "ready" : "no-session");
    });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const validationError = validateAdminNewPassword(password, confirmPassword);

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSubmitting(true);
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        throw new Error("No fue posible guardar la contraseña. Intenta nuevamente.");
      }

      const onboardingResponse = await fetch("/api/admin/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      if (!onboardingResponse.ok) {
        throw new Error("La contraseña se guardó, pero no fue posible habilitar el acceso. Intenta nuevamente.");
      }

      await supabase.auth.signOut();
      setStatus("success");
      setTimeout(() => {
        window.location.assign("/admin/login");
      }, REDIRECT_DELAY_MS);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible guardar la contraseña."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="w-full space-y-3 rounded-[30px] border border-[#DDD0C1] bg-white/95 p-6 text-center shadow-soft backdrop-blur sm:p-7">
        <p className="text-sm text-[#6B6258]">Verificando enlace...</p>
      </div>
    );
  }

  if (status === "no-session") {
    return (
      <div className="w-full space-y-4 rounded-[30px] border border-[#DDD0C1] bg-white/95 p-6 text-center shadow-soft backdrop-blur sm:p-7">
        <p className="text-sm leading-6 text-[#6B6258]">
          El enlace no es válido o ya expiró. Solicita una nueva invitación o recuperación de
          contraseña.
        </p>
        <a
          href="/admin/login"
          className="inline-flex w-full items-center justify-center rounded-[18px] bg-[#B88B58] px-4 py-3 font-semibold text-white transition hover:bg-[#8A6036]"
        >
          Volver al ingreso
        </a>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="w-full space-y-3 rounded-[30px] border border-[#DDD0C1] bg-white/95 p-6 text-center shadow-soft backdrop-blur sm:p-7">
        <p className="text-sm leading-6 text-[#191714]">
          Contraseña actualizada correctamente. Redirigiendo al ingreso...
        </p>
      </div>
    );
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="w-full space-y-6 rounded-[30px] border border-[#DDD0C1] bg-white/95 p-6 shadow-soft backdrop-blur sm:p-7"
    >
      <div className="space-y-3">
        <h1 className="text-3xl font-bold leading-tight text-[#191714] sm:text-4xl">
          Definir contraseña
        </h1>
        <p className="copy-justified text-sm leading-6 text-[#6B6258]">
          Define la contraseña para tu cuenta de administrador.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#191714]">Nueva contraseña</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          className="w-full rounded-[18px] border border-[#DDD0C1] bg-[#F7F1E8] px-4 py-3 text-[#191714] outline-none transition focus:border-[#B88B58]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#191714]">Confirmar contraseña</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          className="w-full rounded-[18px] border border-[#DDD0C1] bg-[#F7F1E8] px-4 py-3 text-[#191714] outline-none transition focus:border-[#B88B58]"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-[18px] bg-[#B88B58] px-4 py-3 font-semibold text-white transition hover:bg-[#8A6036] disabled:cursor-not-allowed disabled:bg-[#D8BEA2]"
      >
        {submitting ? "Guardando..." : "Guardar contraseña"}
      </button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
