import { describe, expect, it } from "vitest";
import { __testables } from "@/repositories/clienteRepository";

const { matchesCustomerIdentity } = __testables;

describe("matchesCustomerIdentity", () => {
  it("coincide por telefono normalizado (formato con espacios vs. e164)", () => {
    const current = { telefono: "+56 9 1234 5678", rut: "", email: "", nombre: "Rodrigo" };
    const candidate = { telefono: "+56912345678", rut: "", email: "", nombre: "R. Riedmann" };

    expect(matchesCustomerIdentity(current, candidate)).toBe(true);
  });

  it("coincide por RUT cuando el telefono no coincide", () => {
    const current = { telefono: "", rut: "11.111.111-1", email: "", nombre: "Rodrigo" };
    const candidate = { telefono: "", rut: "111111111", email: "", nombre: "Otro nombre" };

    expect(matchesCustomerIdentity(current, candidate)).toBe(true);
  });

  it("coincide por correo cuando telefono y RUT no coinciden", () => {
    const current = { telefono: "", rut: "", email: "Rodrigo@Example.com", nombre: "Rodrigo" };
    const candidate = { telefono: "", rut: "", email: "rodrigo@example.com ", nombre: "Otro" };

    expect(matchesCustomerIdentity(current, candidate)).toBe(true);
  });

  it("el nombre por si solo nunca es suficiente para considerarlos el mismo cliente", () => {
    const current = { telefono: "", rut: "", email: "", nombre: "Rodrigo Riedmann" };
    const candidate = { telefono: "", rut: "", email: "", nombre: "Rodrigo Riedmann" };

    expect(matchesCustomerIdentity(current, candidate)).toBe(false);
  });

  it("no coincide si todos los identificadores fuertes son distintos", () => {
    const current = {
      telefono: "+56911111111",
      rut: "11.111.111-1",
      email: "uno@example.com",
      nombre: "Uno"
    };
    const candidate = {
      telefono: "+56922222222",
      rut: "22.222.222-2",
      email: "dos@example.com",
      nombre: "Dos"
    };

    expect(matchesCustomerIdentity(current, candidate)).toBe(false);
  });
});
