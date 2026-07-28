import { isValidEmail, normalizeEmail } from "@/lib/validators";
import { feedbackMessages } from "@/lib/ui/feedback-messages";

export type SupabasePasswordRecoveryResponse = {
  data: unknown;
  error: unknown;
};

export type SupabasePasswordRecoveryAuth = {
  resetPasswordForEmail: (
    email: string,
    options: { redirectTo: string }
  ) => Promise<SupabasePasswordRecoveryResponse>;
};

export type PasswordRecoveryResult = {
  /** Mensaje publico, seguro de mostrar tal cual al usuario. */
  message: string;
  /**
   * Estado tecnico interno, NO apto para mostrar al usuario: distingue una
   * solicitud aceptada por Supabase de un correo invalido, un error de
   * Supabase o una excepcion (red, configuracion, rate limit). El mensaje
   * publico es identico en todos los casos para no revelar si el correo existe.
   */
  requestAccepted: boolean;
};

export async function requestAdminPasswordRecovery(
  rawEmail: string,
  auth: SupabasePasswordRecoveryAuth,
  redirectTo: string
): Promise<PasswordRecoveryResult> {
  const email = normalizeEmail(rawEmail);

  if (!isValidEmail(email)) {
    return {
      requestAccepted: false,
      message: feedbackMessages.adminPasswordRecoveryInvalidEmail
    };
  }

  let requestAccepted = false;

  try {
    const { error } = await auth.resetPasswordForEmail(email, { redirectTo });
    requestAccepted = !error;
  } catch {
    // Nunca se expone el motivo real: evita revelar si el correo existe o el estado del servicio.
    requestAccepted = false;
  }

  return {
    requestAccepted,
    message: feedbackMessages.adminPasswordRecoveryRequested
  };
}
