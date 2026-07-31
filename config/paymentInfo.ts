/**
 * Datos bancarios para transferencia manual.
 *
 * Vacio a proposito: los valores reales de Pauli Store (titular, RUT, banco,
 * numero de cuenta y correo) se eliminaron en la Fase 1B porque son datos
 * financieros reales de una persona de otro negocio y no corresponden a
 * Perfume Store. La fuente definitiva es business_settings, conectada desde
 * el servidor por BusinessSettingsRepository en la Fase 3B.1A.
 *
 * Este objeto se conserva vacio solo por compatibilidad de tipos/pruebas
 * heredadas. No es una fuente de runtime y nunca debe completarse: cualquier
 * valor puesto aqui quedaria hardcodeado en el bundle de la aplicacion.
 */
export const paymentInfo = {
  accountHolder: "",
  rut: "",
  bank: "",
  accountType: "",
  accountNumber: "",
  email: ""
} as const;

export type PaymentInfo = {
  accountHolder: string;
  rut: string;
  bank: string;
  accountType: string;
  accountNumber: string;
  email: string;
};

/**
 * Un mensaje de solicitud de transferencia nunca debe enviarse con datos
 * bancarios a medio completar (ver paymentInfo mas arriba: hoy esta vacio a
 * proposito). Los llamadores deben verificar esto antes de construir/abrir
 * el mensaje y mostrar un error claro en vez de mandar algo incompleto.
 */
export function isPaymentInfoComplete(info: PaymentInfo = paymentInfo): boolean {
  return (
    info.accountHolder.trim() !== "" &&
    info.rut.trim() !== "" &&
    info.bank.trim() !== "" &&
    info.accountType.trim() !== "" &&
    info.accountNumber.trim() !== "" &&
    info.email.trim() !== ""
  );
}
