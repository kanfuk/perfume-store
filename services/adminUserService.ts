import type { User } from "@supabase/supabase-js";
import {
  type AdminUserListItem,
  type AdminUserRole,
  buildAdminInviteRedirectUrl,
  deriveAdminUserStatus,
  type InviteAdminUserInput,
  canResendAdminInvitation,
  normalizeAdminEmail,
  wouldRemoveLastActiveOwner
} from "@/lib/admin-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminProfile = {
  id: string;
  auth_user_id: string | null;
  email: string;
  nombre: string | null;
  rol: AdminUserRole;
  activo: boolean;
  invited_at: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
};

export type AdminUserServiceCode =
  | "DUPLICATE"
  | "USER_EXISTS"
  | "NOT_FOUND"
  | "NOT_PENDING"
  | "SELF_LOCKOUT"
  | "LAST_OWNER"
  | "INVITE_FAILED"
  | "UPDATE_FAILED";

export class AdminUserServiceError extends Error {
  constructor(public readonly code: AdminUserServiceCode) {
    super(code);
  }
}

function toListItem(profile: AdminProfile, authUser: User | undefined): AdminUserListItem {
  const status = deriveAdminUserStatus({
    active: profile.activo,
    onboardingCompletedAt: profile.onboarding_completed_at
  });

  return {
    id: profile.id,
    name: profile.nombre?.trim() || "Sin nombre",
    email: profile.email,
    role: profile.rol,
    status,
    active: profile.activo,
    invitedAt: authUser?.invited_at || profile.invited_at,
    createdAt: profile.created_at,
    lastSignInAt: authUser?.last_sign_in_at || null
  };
}

async function listAllAuthUsers() {
  const client = createSupabaseServerClient();
  const users: User[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new AdminUserServiceError("UPDATE_FAILED");
    users.push(...data.users);
    if (data.users.length < 1000) break;
    page += 1;
  }

  return users;
}

async function getProfile(profileId: string) {
  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("usuarios_admin")
    .select("id, auth_user_id, email, nombre, rol, activo, invited_at, onboarding_completed_at, created_at")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new AdminUserServiceError("UPDATE_FAILED");
  if (!data) throw new AdminUserServiceError("NOT_FOUND");
  return data as AdminProfile;
}

async function assertOwnerWillRemain(profile: AdminProfile, next: { role?: AdminUserRole; active?: boolean }) {
  const removesOwner =
    profile.rol === "OWNER" &&
    profile.activo &&
    (next.role === "ADMIN" || next.active === false);
  if (!removesOwner) return;

  const client = createSupabaseServerClient();
  const { count, error } = await client
    .from("usuarios_admin")
    .select("id", { count: "exact", head: true })
    .eq("rol", "OWNER")
    .eq("activo", true);
  if (error) throw new AdminUserServiceError("UPDATE_FAILED");
  if (wouldRemoveLastActiveOwner(
    { role: profile.rol, active: profile.activo },
    next,
    count ?? 0
  )) throw new AdminUserServiceError("LAST_OWNER");
}

export function createAdminUserService() {
  return {
    async list(): Promise<AdminUserListItem[]> {
      const client = createSupabaseServerClient();
      const [{ data, error }, authUsers] = await Promise.all([
        client
          .from("usuarios_admin")
          .select("id, auth_user_id, email, nombre, rol, activo, invited_at, onboarding_completed_at, created_at")
          .order("created_at", { ascending: true }),
        listAllAuthUsers()
      ]);
      if (error) throw new AdminUserServiceError("UPDATE_FAILED");

      const byId = new Map(authUsers.map((user) => [user.id, user]));
      const byEmail = new Map(
        authUsers
          .filter((user) => user.email)
          .map((user) => [normalizeAdminEmail(user.email ?? ""), user])
      );
      return ((data ?? []) as AdminProfile[]).map((profile) =>
        toListItem(profile, byId.get(profile.auth_user_id ?? "") ?? byEmail.get(profile.email))
      );
    },

    async invite(input: InviteAdminUserInput, redirectOrigin: string): Promise<void> {
      const client = createSupabaseServerClient();
      const { data: existingProfile, error: profileError } = await client
        .from("usuarios_admin")
        .select("id")
        .eq("email", input.email)
        .maybeSingle();
      if (profileError) throw new AdminUserServiceError("INVITE_FAILED");
      if (existingProfile) throw new AdminUserServiceError("DUPLICATE");

      const authUsers = await listAllAuthUsers();
      if (authUsers.some((user) => normalizeAdminEmail(user.email ?? "") === input.email)) {
        throw new AdminUserServiceError("USER_EXISTS");
      }

      const { data, error } = await client.auth.admin.inviteUserByEmail(input.email, {
        redirectTo: buildAdminInviteRedirectUrl(redirectOrigin),
        data: { nombre: input.name }
      });
      if (error || !data.user) throw new AdminUserServiceError("INVITE_FAILED");

      const { error: insertError } = await client.from("usuarios_admin").insert({
        auth_user_id: data.user.id,
        email: input.email,
        nombre: input.name,
        rol: input.role,
        activo: true,
        invited_at: new Date().toISOString(),
        onboarding_completed_at: null
      });
      if (insertError) {
        await client.auth.admin.deleteUser(data.user.id).catch(() => undefined);
        throw new AdminUserServiceError("INVITE_FAILED");
      }
    },

    async resend(profileId: string, redirectOrigin: string): Promise<void> {
      const client = createSupabaseServerClient();
      const profile = await getProfile(profileId);
      const authUsers = await listAllAuthUsers();
      const authUser = authUsers.find(
        (user) => user.id === profile.auth_user_id || normalizeAdminEmail(user.email ?? "") === profile.email
      );
      if (!authUser || !canResendAdminInvitation(profile.onboarding_completed_at)) {
        throw new AdminUserServiceError("NOT_PENDING");
      }

      const { error } = await client.auth.admin.inviteUserByEmail(profile.email, {
        redirectTo: buildAdminInviteRedirectUrl(redirectOrigin),
        data: { nombre: profile.nombre }
      });
      if (error) throw new AdminUserServiceError("INVITE_FAILED");

      const { error: updateError } = await client
        .from("usuarios_admin")
        .update({ invited_at: new Date().toISOString() })
        .eq("id", profile.id);
      if (updateError) throw new AdminUserServiceError("UPDATE_FAILED");
    },

    async setActive(profileId: string, active: boolean, actorUserId: string): Promise<void> {
      const client = createSupabaseServerClient();
      const profile = await getProfile(profileId);
      if (!active && profile.auth_user_id === actorUserId) {
        throw new AdminUserServiceError("SELF_LOCKOUT");
      }
      await assertOwnerWillRemain(profile, { active });
      const { error } = await client.from("usuarios_admin").update({ activo: active }).eq("id", profile.id);
      if (error?.message.includes("ADMIN_LAST_OWNER")) throw new AdminUserServiceError("LAST_OWNER");
      if (error) throw new AdminUserServiceError("UPDATE_FAILED");
    },

    async setRole(profileId: string, role: AdminUserRole, actorUserId: string): Promise<void> {
      const client = createSupabaseServerClient();
      const profile = await getProfile(profileId);
      if (role === "ADMIN" && profile.auth_user_id === actorUserId) {
        throw new AdminUserServiceError("SELF_LOCKOUT");
      }
      await assertOwnerWillRemain(profile, { role });
      const { error } = await client.from("usuarios_admin").update({ rol: role }).eq("id", profile.id);
      if (error?.message.includes("ADMIN_LAST_OWNER")) throw new AdminUserServiceError("LAST_OWNER");
      if (error) throw new AdminUserServiceError("UPDATE_FAILED");
    }
  };
}
