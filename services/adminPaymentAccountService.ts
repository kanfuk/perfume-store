import type { AuthenticatedAdmin } from "@/lib/admin-auth";
import {
  adminPaymentAccountToFormInput,
  getAdminPaymentAccountStatus,
  validateAdminPaymentAccount,
  type AdminPaymentAccountFormInput,
  type AdminPaymentAccountRecord,
  type AdminPaymentAccountStatus,
  type ValidateAdminPaymentAccountResult
} from "@/lib/admin-payment-accounts";
import { maskAccountNumber } from "@/lib/businessPaymentSettings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PaymentAccountRow = {
  id: string;
  admin_user_id: string;
  banco: string;
  banco_otro: string | null;
  tipo_cuenta: string;
  tipo_cuenta_otro: string | null;
  titular: string;
  rut_titular: string;
  numero_cuenta: string;
  correo: string;
  activo: boolean;
};

type AdminProfileRow = {
  id: string;
  nombre: string | null;
  email: string;
  rol: "OWNER" | "ADMIN";
  activo: boolean;
  onboarding_completed_at: string | null;
};

export type EligiblePaymentReceiver = {
  id: string;
  name: string;
  email: string;
  maskedAccountNumber: string;
};

export type AdminPaymentAccountSummary = {
  status: AdminPaymentAccountStatus;
  maskedAccountNumber: string | null;
};

export type AdminPaymentAccountContext = {
  role: "OWNER" | "ADMIN";
  requiresReceiverSelection: boolean;
  accountConfigured: boolean;
};

export type AdminPaymentAccountServiceCode =
  | "NOT_FOUND"
  | "NOT_ADMIN"
  | "ACCOUNT_REQUIRED"
  | "ACCOUNT_INACTIVE"
  | "READ_FAILED"
  | "SAVE_FAILED";

export class AdminPaymentAccountServiceError extends Error {
  constructor(public readonly code: AdminPaymentAccountServiceCode) {
    super(code);
  }
}

function mapAccount(row: PaymentAccountRow): AdminPaymentAccountRecord {
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    banco: row.banco,
    bancoOtro: row.banco_otro,
    tipoCuenta: row.tipo_cuenta,
    tipoCuentaOtro: row.tipo_cuenta_otro,
    titular: row.titular,
    rutTitular: row.rut_titular,
    numeroCuenta: row.numero_cuenta,
    correo: row.correo,
    active: row.activo
  };
}

async function getAdminProfile(profileId: string): Promise<AdminProfileRow> {
  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("usuarios_admin")
    .select("id, nombre, email, rol, activo, onboarding_completed_at")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new AdminPaymentAccountServiceError("READ_FAILED");
  if (!data) throw new AdminPaymentAccountServiceError("NOT_FOUND");
  return data as AdminProfileRow;
}

export async function getAdminPaymentAccount(
  profileId: string
): Promise<AdminPaymentAccountRecord | null> {
  const client = createSupabaseServerClient();
  const { data, error } = await client
    .from("admin_payment_accounts")
    .select(
      "id, admin_user_id, banco, banco_otro, tipo_cuenta, tipo_cuenta_otro, titular, rut_titular, numero_cuenta, correo, activo"
    )
    .eq("admin_user_id", profileId)
    .maybeSingle();
  if (error) throw new AdminPaymentAccountServiceError("READ_FAILED");
  return data ? mapAccount(data as PaymentAccountRow) : null;
}

export async function getUsableAdminPaymentAccount(
  profileId: string
): Promise<AdminPaymentAccountRecord> {
  const profile = await getAdminProfile(profileId);
  if (profile.rol !== "ADMIN" || !profile.activo || !profile.onboarding_completed_at) {
    throw new AdminPaymentAccountServiceError("NOT_ADMIN");
  }
  const account = await getAdminPaymentAccount(profileId);
  if (!account) throw new AdminPaymentAccountServiceError("ACCOUNT_REQUIRED");
  if (!account.active) throw new AdminPaymentAccountServiceError("ACCOUNT_INACTIVE");
  if (getAdminPaymentAccountStatus(account) !== "CONFIGURED") {
    throw new AdminPaymentAccountServiceError("ACCOUNT_REQUIRED");
  }
  return account;
}

export function createAdminPaymentAccountService() {
  return {
    async getContext(admin: AuthenticatedAdmin): Promise<AdminPaymentAccountContext> {
      if (admin.rol === "OWNER") {
        return {
          role: "OWNER",
          requiresReceiverSelection: true,
          accountConfigured: true
        };
      }
      const account = await getAdminPaymentAccount(admin.profileId);
      return {
        role: "ADMIN",
        requiresReceiverSelection: false,
        accountConfigured: getAdminPaymentAccountStatus(account) === "CONFIGURED"
      };
    },

    async listSummaries(): Promise<Map<string, AdminPaymentAccountSummary>> {
      const client = createSupabaseServerClient();
      const { data, error } = await client
        .from("admin_payment_accounts")
        .select(
          "id, admin_user_id, banco, banco_otro, tipo_cuenta, tipo_cuenta_otro, titular, rut_titular, numero_cuenta, correo, activo"
        );
      if (error) throw new AdminPaymentAccountServiceError("READ_FAILED");
      return new Map(
        ((data ?? []) as PaymentAccountRow[]).map((row) => {
          const account = mapAccount(row);
          return [
            account.adminUserId,
            {
              status: getAdminPaymentAccountStatus(account),
              maskedAccountNumber: maskAccountNumber(account.numeroCuenta)
            }
          ];
        })
      );
    },

    async listEligibleReceivers(): Promise<EligiblePaymentReceiver[]> {
      const client = createSupabaseServerClient();
      const { data, error } = await client
        .from("usuarios_admin")
        .select("id, nombre, email, rol, activo, onboarding_completed_at")
        .eq("rol", "ADMIN")
        .eq("activo", true)
        .not("onboarding_completed_at", "is", null)
        .order("nombre", { ascending: true });
      if (error) throw new AdminPaymentAccountServiceError("READ_FAILED");

      const profiles = (data ?? []) as AdminProfileRow[];
      const accounts = await this.listSummaries();
      return profiles.flatMap((profile) => {
        const account = accounts.get(profile.id);
        if (account?.status !== "CONFIGURED" || !account.maskedAccountNumber) return [];
        return [{
          id: profile.id,
          name: profile.nombre?.trim() || "Sin nombre",
          email: profile.email,
          maskedAccountNumber: account.maskedAccountNumber
        }];
      });
    },

    async getForOwner(profileId: string): Promise<AdminPaymentAccountFormInput | null> {
      const profile = await getAdminProfile(profileId);
      if (profile.rol !== "ADMIN") {
        throw new AdminPaymentAccountServiceError("NOT_ADMIN");
      }
      const account = await getAdminPaymentAccount(profileId);
      return account ? adminPaymentAccountToFormInput(account) : null;
    },

    async saveForOwner(
      profileId: string,
      input: AdminPaymentAccountFormInput
    ): Promise<ValidateAdminPaymentAccountResult> {
      const profile = await getAdminProfile(profileId);
      if (profile.rol !== "ADMIN") {
        throw new AdminPaymentAccountServiceError("NOT_ADMIN");
      }
      const validation = validateAdminPaymentAccount(input);
      if (!validation.valid) return validation;

      const client = createSupabaseServerClient();
      const account = validation.data;
      const { error } = await client.from("admin_payment_accounts").upsert(
        {
          admin_user_id: profileId,
          banco: account.banco,
          banco_otro: account.bancoOtro,
          tipo_cuenta: account.tipoCuenta,
          tipo_cuenta_otro: account.tipoCuentaOtro,
          titular: account.titular,
          rut_titular: account.rutTitular,
          numero_cuenta: account.numeroCuenta,
          correo: account.correo,
          activo: account.active
        },
        { onConflict: "admin_user_id" }
      );
      if (error) throw new AdminPaymentAccountServiceError("SAVE_FAILED");
      return validation;
    }
  };
}
