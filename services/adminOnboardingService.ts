import { normalizeAdminEmail } from "@/lib/admin-users";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AdminOnboardingErrorCode = "UNAUTHENTICATED" | "NOT_AUTHORIZED" | "UPDATE_FAILED";

export class AdminOnboardingError extends Error {
  constructor(public readonly code: AdminOnboardingErrorCode) {
    super(code);
  }
}

type OnboardingProfile = {
  id: string;
  onboarding_completed_at: string | null;
};

export async function completeAuthenticatedAdminOnboarding() {
  const authClient = await createSupabaseAuthServerClient();
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const authUser = authData.user;

  if (authError || !authUser?.email) {
    throw new AdminOnboardingError("UNAUTHENTICATED");
  }

  const serviceClient = createSupabaseServerClient();
  const columns = "id, onboarding_completed_at";
  let { data: profile, error: profileError } = await serviceClient
    .from("usuarios_admin")
    .select(columns)
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (profileError) throw new AdminOnboardingError("UPDATE_FAILED");

  if (!profile) {
    const fallback = await serviceClient
      .from("usuarios_admin")
      .select(columns)
      .eq("email", normalizeAdminEmail(authUser.email))
      .maybeSingle();
    profile = fallback.data;
    profileError = fallback.error;
  }

  if (profileError) throw new AdminOnboardingError("UPDATE_FAILED");
  if (!profile) throw new AdminOnboardingError("NOT_AUTHORIZED");

  const resolvedProfile = profile as OnboardingProfile;
  if (resolvedProfile.onboarding_completed_at) return;

  const { data: updated, error: updateError } = await serviceClient
    .from("usuarios_admin")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", resolvedProfile.id)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) throw new AdminOnboardingError("UPDATE_FAILED");
}
