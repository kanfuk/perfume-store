"use client";

import { useEffect, useState } from "react";
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

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        clearUrlFragment();
        setStatus("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      clearUrlFragment();
      setStatus(data.session ? "ready" : "no-session");
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
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
      <div className="w-full space-y-3 rounded-[30px] border border-[#e4e7ec] bg-white/95 p-6 text-center shadow-soft backdrop-blur sm:p-7">
        <p className="text-sm text-[#667085]">Verificando enlace...</p>
      </div>
    );
  }

  if (status === "no-session") {
    return (
      <div className="w-full space-y-4 rounded-[30px] border border-[#e4e7ec] bg-white/95 p-6 text-center shadow-soft backdrop-blur sm:p-7">
        <p className="text-sm leading-6 text-[#667085]">
          El enlace no es válido o ya expiró. Solicita una nueva invitación o recuperación de
          contraseña.
        </p>
        <a
          href="/admin/login"
          className="inline-flex w-full items-center justify-center rounded-[18px] bg-[#7357ff] px-4 py-3 font-semibold text-white transition hover:bg-[#5434e6]"
        >
          Volver al ingreso
        </a>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="w-full space-y-3 rounded-[30px] border border-[#e4e7ec] bg-white/95 p-6 text-center shadow-soft backdrop-blur sm:p-7">
        <p className="text-sm leading-6 text-[#111318]">
          Contraseña actualizada correctamente. Redirigiendo al ingreso...
        </p>
      </div>
    );
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      className="w-full space-y-6 rounded-[30px] border border-[#e4e7ec] bg-white/95 p-6 shadow-soft backdrop-blur sm:p-7"
    >
      <div className="space-y-3">
        <h1 className="text-3xl font-bold leading-tight text-[#111318] sm:text-4xl">
          Definir contraseña
        </h1>
        <p className="copy-justified text-sm leading-6 text-[#667085]">
          Define la contraseña para tu cuenta de administrador.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#111318]">Nueva contraseña</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          className="w-full rounded-[18px] border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-3 text-[#111318] outline-none transition focus:border-[#7357ff]"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#111318]">Confirmar contraseña</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          className="w-full rounded-[18px] border border-[#e4e7ec] bg-[#f7f8fa] px-4 py-3 text-[#111318] outline-none transition focus:border-[#7357ff]"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-[18px] bg-[#7357ff] px-4 py-3 font-semibold text-white transition hover:bg-[#5434e6] disabled:cursor-not-allowed disabled:bg-[#c1b6ff]"
      >
        {submitting ? "Guardando..." : "Guardar contraseña"}
      </button>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
