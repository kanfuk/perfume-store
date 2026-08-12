import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAdmin } = vi.hoisted(() => ({
  getAuthenticatedAdmin: vi.fn()
}));
const { sendPendingOrdersPushToAdmins } = vi.hoisted(() => ({
  sendPendingOrdersPushToAdmins: vi.fn()
}));

vi.mock("@/lib/admin-auth", () => ({ getAuthenticatedAdmin }));
vi.mock("@/lib/http-security", () => ({
  validateTrustedOrigin: () => null,
  validateJsonRequest: () => null
}));
vi.mock("@/lib/pwa/sendWebPush", () => ({ sendPendingOrdersPushToAdmins }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table === "admin_push_subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: [{ id: "sub-1" }], error: null })
              })
            })
          })
        };
      }

      if (table === "pedidos") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null })
          })
        };
      }

      throw new Error(`Tabla inesperada en el test: ${table}`);
    }
  })
}));

import { POST } from "@/app/api/admin/push/test/route";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/push/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost"
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/admin/push/test", () => {
  beforeEach(() => {
    getAuthenticatedAdmin.mockReset();
    getAuthenticatedAdmin.mockResolvedValue({ userId: "admin-1" });
    sendPendingOrdersPushToAdmins.mockReset();
  });

  it("no devuelve exito cuando sent === 0", async () => {
    sendPendingOrdersPushToAdmins.mockResolvedValue({
      sent: 0,
      failed: 1,
      expired: 0,
      skipped: false
    });

    const response = await POST(request({ deviceId: "device-1" }));
    const json = (await response.json()) as { error?: string; message?: string };

    expect(response.status).toBe(502);
    expect(json.message).toBeUndefined();
    expect(json.error).toBe(
      "No fue posible entregar la notificación al servicio push del dispositivo."
    );
  });

  it("devuelve mensaje de aceptacion cuando sent >= 1", async () => {
    sendPendingOrdersPushToAdmins.mockResolvedValue({
      sent: 1,
      failed: 0,
      expired: 0,
      skipped: false
    });

    const response = await POST(request({ deviceId: "device-1" }));
    const json = (await response.json()) as { error?: string; message?: string };

    expect(response.ok).toBe(true);
    expect(json.message).toBe(
      "El servicio push aceptó la notificación de prueba para este dispositivo."
    );
  });

  it("responde error legible cuando VAPID no esta configurado (skipped)", async () => {
    sendPendingOrdersPushToAdmins.mockResolvedValue({
      sent: 0,
      failed: 0,
      expired: 0,
      skipped: true,
      reason: "VAPID_NOT_CONFIGURED"
    });

    const response = await POST(request({ deviceId: "device-1" }));
    const json = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(json.error).toBe("Faltan variables VAPID para enviar Web Push.");
  });
});
