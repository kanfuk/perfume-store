import { getAdminUrl } from "@/lib/public-url";

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
  isCurrentUser: boolean;
  isPrimaryOwner: boolean;
  paymentAccountStatus: "CONFIGURED" | "PENDING" | "INACTIVE" | null;
  maskedAccountNumber: string | null;
};

export type InviteAdminUserInput = {
  name: string;
  email: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAdminEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isPrimaryOwnerRole(role: AdminUserRole) {
  return role === "OWNER";
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

export function buildAdminInviteRedirectUrl(_requestOrigin?: string) {
  return getAdminUrl("/admin/set-password");
}

export function validateInviteAdminUserInput(value: unknown):
  | { valid: true; data: InviteAdminUserInput }
  | { valid: false; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, message: "Los datos de la invitación no son válidos." };
  }

  const input = value as Record<string, unknown>;
  const allowedFields = new Set(["name", "email"]);
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
  return { valid: true, data: { name, email } };
}
