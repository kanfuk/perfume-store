/**
 * Proyecto: Perfume Store
 * Modulo: Configuracion del negocio (datos de transferencia)
 * Descripcion: Orquesta validacion + persistencia de business_settings.
 * Seguridad: no incluir datos bancarios reales en este archivo.
 */
import {
  isBusinessPaymentSettingsComplete,
  validateBusinessPaymentSettings,
  type BusinessPaymentSettings,
  type BusinessPaymentSettingsFormInput,
  type ValidateBusinessPaymentSettingsResult
} from "@/lib/businessPaymentSettings";
import type { BusinessSettingsRepository } from "@/repositories/businessSettingsRepository";
import { getBusinessSettingsRepository } from "@/repositories/businessSettingsRepository";

export class BusinessSettingsService {
  constructor(private readonly repository: BusinessSettingsRepository) {}

  async obtenerConfiguracionPago(): Promise<BusinessPaymentSettings> {
    return this.repository.obtenerConfiguracionPago();
  }

  async obtenerEstadoConfiguracionPago(): Promise<{
    settings: BusinessPaymentSettings;
    completa: boolean;
  }> {
    const settings = await this.obtenerConfiguracionPago();
    return { settings, completa: isBusinessPaymentSettingsComplete(settings) };
  }

  async guardarConfiguracionPago(
    input: BusinessPaymentSettingsFormInput
  ): Promise<ValidateBusinessPaymentSettingsResult> {
    const result = validateBusinessPaymentSettings(input);

    if (!result.valid) {
      return result;
    }

    const saved = await this.repository.guardarConfiguracionPago(result.data);
    return { valid: true, data: saved };
  }
}

export function createBusinessSettingsService(): BusinessSettingsService {
  return new BusinessSettingsService(getBusinessSettingsRepository());
}
