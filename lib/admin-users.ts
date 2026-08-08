export const ADMIN_USER_ROLES = ["OWNER", "ADMIN"] as const;

export type AdminUserRole = (typeof ADMIN_USER_ROLES)[number];
export type AdminUserStatus = "PENDING_INVITATION" | "ACTIVE" | "INACTIVE";

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  active: boolean;
  invitedAt: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export type InviteAdminUserInput = {
  name: string;
  email: string;
  role: AdminUserRole;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAdminEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isAdminUserRole(value: unknown): value is AdminUserRole {
  return typeof value === "string" && ADMIN_USER_ROLES.includes(value as AdminUserRole);
}

export function wouldRemoveLastActiveOwner(
  current: { role: AdminUserRole; active: boolean },
  next: { role?: AdminUserRole; active?: boolean },
  activeOwnerCount: number
) {
  return current.role === "OWNER" &&
    current.active &&
    (next.role === "ADMIN" || next.active === false) &&
    activeOwnerCount <= 1;
}

export function deriveAdminUserStatus(input: {
  active: boolean;
  onboardingCompletedAt: string | null;
}): AdminUserStatus {
  if (!input.active) return "INACTIVE";
  return input.onboardingCompletedAt ? "ACTIVE" : "PENDING_INVITATION";
}

export function canResendAdminInvitation(onboardingCompletedAt: string | null) {
  return onboardingCompletedAt === null;
}

export function validateInviteAdminUserInput(value: unknown):
  | { valid: true; data: InviteAdminUserInput }
  | { valid: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, message: "Los datos de la invitación no son válidos." };
  }

  const input = value as Record<string, unknown>;
  const allowedFields = new Set(["name", "email", "role"]);
  if (Object.keys(input).some((key) => !allowedFields.has(key))) {
    return { valid: false, message: "La invitación contiene campos no permitidos." };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? normalizeAdminEmail(input.email) : "";

  if (name.length < 2 || name.length > 100) {
    return { valid: false, message: "Ingresa un nombre válido." };
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { valid: false, message: "Ingresa un correo válido." };
  }
  if (!isAdminUserRole(input.role)) {
    return { valid: false, message: "Selecciona un rol válido." };
  }

  return { valid: true, data: { name, email, role: input.role } };
}
