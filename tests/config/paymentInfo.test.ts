import { describe, expect, it } from "vitest";
import { isPaymentInfoComplete, paymentInfo, type PaymentInfo } from "@/config/paymentInfo";

const completeInfo: PaymentInfo = {
  accountHolder: "Smellme SpA",
  rut: "76.123.456-7",
  bank: "Banco Estado",
  accountType: "Cuenta Vista",
  accountNumber: "12345678",
  email: "pagos@smellme.cl"
};

describe("isPaymentInfoComplete", () => {
  it("retorna false para paymentInfo por defecto (vacio a proposito)", () => {
    expect(isPaymentInfoComplete(paymentInfo)).toBe(false);
  });

  it("retorna true cuando todos los campos estan presentes", () => {
    expect(isPaymentInfoComplete(completeInfo)).toBe(true);
  });

  it.each(Object.keys(completeInfo) as Array<keyof PaymentInfo>)(
    "retorna false si falta %s",
    (field) => {
      expect(isPaymentInfoComplete({ ...completeInfo, [field]: "" })).toBe(false);
    }
  );

  it("trata los espacios en blanco como campo vacio", () => {
    expect(isPaymentInfoComplete({ ...completeInfo, bank: "   " })).toBe(false);
  });
});
