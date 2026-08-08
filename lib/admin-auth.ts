import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminUserRole } from "@/lib/admin-users";

export type AuthenticatedAdmin = {
  userId: string;
  email: string;
  nombre: string | null;
  rol: AdminUserRole;
};

export async function getAuthenticatedAdmin(): Promise<AuthenticatedAdmin | null> {
  const authClient = await createSupabaseAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user?.email) {
    return null;
  }

  const serviceClient = createSupabaseServerClient();
  const { data, error } = await serviceClient
    .from("usuarios_admin")
    .select("email, nombre, rol, activo, onboarding_completed_at")
    .eq("email", user.email.trim().toLowerCase())
    .eq("activo", true)
    .not("onboarding_completed_at", "is", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    userId: user.id,
    email: data.email,
    nombre: data.nombre,
    rol: data.rol as AdminUserRole
  };
}

export function isOwnerAdmin(admin: AuthenticatedAdmin | null): admin is AuthenticatedAdmin {
  return admin?.rol === "OWNER";
}

export async function isAdminAuthenticated() {
  const admin = await getAuthenticatedAdmin();
  return Boolean(admin);
}
