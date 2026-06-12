import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthenticatedAdmin = {
  userId: string;
  email: string;
  nombre: string | null;
  rol: string;
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
    .select("email, nombre, rol, activo")
    .eq("email", user.email)
    .eq("activo", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    userId: user.id,
    email: data.email,
    nombre: data.nombre,
    rol: data.rol
  };
}

export async function isAdminAuthenticated() {
  const admin = await getAuthenticatedAdmin();
  return Boolean(admin);
}
