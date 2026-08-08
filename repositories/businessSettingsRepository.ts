/**
 * Proyecto: Perfume Store
 * Modulo: Configuracion del negocio (datos de transferencia)
 * Descripcion: Lee/escribe la fila singleton de business_settings. La tabla
 * y sus columnas de pago (banco, tipo_cuenta, numero_cuenta, titular_cuenta,
 * rut_titular, correo) ya existian desde la migracion fundacional; esta es
 * la primera vez que se conecta un repositorio TypeScript (ver
 * docs/SMELLME_BUSINESS_PAYMENT_SETTINGS.md). RLS restringe la tabla
 * completa a is_active_admin(): nunca se expone via un endpoint publico.
 * Seguridad: no incluir datos bancarios reales en este archivo.
 */
import type { BusinessPaymentSettings } from "@/lib/businessPaymentSettings";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BUSINESS_SETTINGS_SINGLETON_ID = "00000000-0000-0000-0000-000000000001";

export interface BusinessSettingsRepository {
  obtenerConfiguracionPago(): Promise<BusinessPaymentSettings>;
  guardarConfiguracionPago(data: BusinessPaymentSettings): Promise<BusinessPaymentSettings>;
}

class MemoryBusinessSettingsRepository implements BusinessSettingsRepository {
  async obtenerConfiguracionPago(): Promise<BusinessPaymentSettings> {
    const record = localStore.businessSettings;

    return {
      banco: record.banco ?? "",
      tipoCuenta: record.tipoCuenta ?? "",
      numeroCuenta: record.numeroCuenta ?? "",
      titularCuenta: record.titularCuenta ?? "",
      rutTitular: record.rutTitular ?? "",
      correo: record.correo ?? ""
    };
  }

  async guardarConfiguracionPago(
    data: BusinessPaymentSettings
  ): Promise<BusinessPaymentSettings> {
    localStore.businessSettings = {
      ...localStore.businessSettings,
      banco: data.banco,
      tipoCuenta: data.tipoCuenta,
      numeroCuenta: data.numeroCuenta,
      titularCuenta: data.titularCuenta,
      rutTitular: data.rutTitular,
      correo: data.correo,
      updatedAt: new Date().toISOString()
    };

    return this.obtenerConfiguracionPago();
  }
}

class SupabaseBusinessSettingsRepository implements BusinessSettingsRepository {
  async obtenerConfiguracionPago(): Promise<BusinessPaymentSettings> {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("business_settings")
      .select("banco, tipo_cuenta, numero_cuenta, titular_cuenta, rut_titular, correo")
      .eq("id", BUSINESS_SETTINGS_SINGLETON_ID)
      .maybeSingle();

    if (error) {
      throw new Error("No fue posible cargar la configuracion de pago.");
    }

    return {
      banco: data?.banco ?? "",
      tipoCuenta: data?.tipo_cuenta ?? "",
      numeroCuenta: data?.numero_cuenta ?? "",
      titularCuenta: data?.titular_cuenta ?? "",
      rutTitular: data?.rut_titular ?? "",
      correo: data?.correo ?? ""
    };
  }

  async guardarConfiguracionPago(
    data: BusinessPaymentSettings
  ): Promise<BusinessPaymentSettings> {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("business_settings")
      .update({
        banco: data.banco,
        tipo_cuenta: data.tipoCuenta,
        numero_cuenta: data.numeroCuenta,
        titular_cuenta: data.titularCuenta,
        rut_titular: data.rutTitular,
        correo: data.correo
      })
      .eq("id", BUSINESS_SETTINGS_SINGLETON_ID);

    if (error) {
      throw new Error("No fue posible guardar la configuracion de pago.");
    }

    return this.obtenerConfiguracionPago();
  }
}

export function getBusinessSettingsRepository(): BusinessSettingsRepository {
  if (isSupabaseConfigured()) {
    return new SupabaseBusinessSettingsRepository();
  }

  return new MemoryBusinessSettingsRepository();
}
