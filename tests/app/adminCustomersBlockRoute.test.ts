import { describe, expect, it, vi, beforeEach } from "vitest";

const { isAdminAuthenticated, getAuthenticatedAdmin } = vi.hoisted(() => ({
  isAdminAuthenticated: vi.fn(async () => true),
  getAuthenticatedAdmin: vi.fn(async () => ({
    userId: "admin-uuid-1",
    email: "admin@smellme.cl",
    nombre: "Admin",
    rol: "admin"
  }))
}));

vi.mock("@/lib/admin-auth", () => ({ isAdminAuthenticated, getAuthenticatedAdmin }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin: () => null,
  validateJsonRequest: () => null
}));

const { actualizarCliente, bloquearCliente, desbloquearCliente } = vi.hoisted(() => ({
  actualizarCliente: vi.fn(async () => ({ id: "cliente-1", nombre: "Cliente Editado", telefono: "", lugarTrabajo: "", bloqueado: false })),
  bloquearCliente: vi.fn(async () => ({ id: "cliente-1", nombre: "Cliente", telefono: "", lugarTrabajo: "", bloqueado: true, motivoBloqueo: "Motivo valido" })),
  desbloquearCliente: vi.fn(async () => ({ id: "cliente-1", nombre: "Cliente", telefono: "", lugarTrabajo: "", bloqueado: false }))
}));

vi.mock("@/services/adminCustomerService", () => ({
  createAdminCustomerService: () => ({
    actualizarCliente,
    bloquearCliente,
    desbloquearCliente
  })
}));

import { PATCH } from "@/app/api/admin/customers/[customerId]/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/customers/cliente-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function makeContext() {
  return { params: Promise.resolve({ customerId: "cliente-1" }) };
}

describe("PATCH /api/admin/customers/[customerId] - banlist (Fase 7.5A)", () => {
  beforeEach(() => {
    isAdminAuthenticated.mockClear();
    getAuthenticatedAdmin.mockClear();
    actualizarCliente.mockClear();
    bloquearCliente.mockClear();
    desbloquearCliente.mockClear();
  });

  it("rechaza con 401 sin sesion (no llama a ningun metodo del servicio)", async () => {
    isAdminAuthenticated.mockResolvedValueOnce(false);
    const response = await PATCH(makeRequest({ action: "block", reason: "Motivo valido" }), makeContext());
    expect(response.status).toBe(401);
    expect(bloquearCliente).not.toHaveBeenCalled();
  });

  it("action: 'block' llama a bloquearCliente con el motivo y el userId del admin autenticado", async () => {
    const response = await PATCH(makeRequest({ action: "block", reason: "Motivo administrativo valido" }), makeContext());
    expect(response.status).toBe(200);
    expect(bloquearCliente).toHaveBeenCalledWith({
      id: "cliente-1",
      motivo: "Motivo administrativo valido",
      bloqueadoPor: "admin-uuid-1"
    });
    const body = await response.json();
    expect(body.customer.bloqueado).toBe(true);
  });

  it("action: 'unblock' llama a desbloquearCliente y nunca pide el motivo", async () => {
    const response = await PATCH(makeRequest({ action: "unblock" }), makeContext());
    expect(response.status).toBe(200);
    expect(desbloquearCliente).toHaveBeenCalledWith("cliente-1");
    expect(bloquearCliente).not.toHaveBeenCalled();
  });

  it("sin action (body de edicion clasico) sigue usando actualizarCliente sin cambios de contrato", async () => {
    const response = await PATCH(
      makeRequest({ nombre: "Cliente Editado", telefono: "912345678", lugarTrabajo: "Finanzas" }),
      makeContext()
    );
    expect(response.status).toBe(200);
    expect(actualizarCliente).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cliente-1", nombre: "Cliente Editado" })
    );
    expect(bloquearCliente).not.toHaveBeenCalled();
    expect(desbloquearCliente).not.toHaveBeenCalled();
  });

  it("propaga un error del servicio (ej. motivo invalido) como 400 sin exponer detalle interno", async () => {
    bloquearCliente.mockRejectedValueOnce(new Error("El motivo del bloqueo debe tener al menos 5 caracteres."));
    const response = await PATCH(makeRequest({ action: "block", reason: "ab" }), makeContext());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/al menos 5/);
  });

  it("propaga 'Cliente no encontrado.' como 400 (nunca un stack ni error crudo de Supabase)", async () => {
    bloquearCliente.mockRejectedValueOnce(new Error("Cliente no encontrado."));
    const response = await PATCH(makeRequest({ action: "block", reason: "Motivo valido aqui" }), makeContext());
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Cliente no encontrado.");
    expect(body.error).not.toMatch(/postgres|supabase|stack/i);
  });
});
