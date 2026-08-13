import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args)
  }
}));

let supabaseState: {
  data: unknown[];
  error: { message: string } | null;
  updateEq: ReturnType<typeof vi.fn<(payload: unknown, id: string) => void>>;
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: supabaseState.data, error: supabaseState.error })
      }),
      update: (payload: unknown) => ({
        eq: (_column: string, id: string) => {
          supabaseState.updateEq(payload, id);
          return Promise.resolve({ data: null, error: null });
        }
      })
    })
  })
}));

const ORIGINAL_ENV = { ...process.env };

function setVapidEnv(configured: boolean) {
  if (configured) {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key";
    process.env.VAPID_PRIVATE_KEY = "private-key";
    process.env.VAPID_SUBJECT = "mailto:admin@smellme.cl";
  } else {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  }
}

function subscriptionRow(id: string) {
  return {
    id,
    user_id: "user-1",
    device_id: "device-1",
    endpoint: `https://push.example.com/${id}`,
    p256dh: "p256dh-key",
    auth: "auth-key"
  };
}

async function loadSendWebPush() {
  vi.resetModules();
  return import("@/lib/pwa/sendWebPush");
}

describe("sendPendingOrdersPushToAdmins", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    sendNotification.mockReset();
    setVapidDetails.mockReset();
    supabaseState = { data: [], error: null, updateEq: vi.fn() };
  });

  it("VAPID ausente => skipped con razon VAPID_NOT_CONFIGURED", async () => {
    setVapidEnv(false);
    const { sendPendingOrdersPushToAdmins } = await loadSendWebPush();

    const result = await sendPendingOrdersPushToAdmins({ pendingCount: 1 });

    expect(result).toEqual({
      sent: 0,
      failed: 0,
      expired: 0,
      skipped: true,
      reason: "VAPID_NOT_CONFIGURED"
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("cero suscripciones activas => skipped con razon NO_ACTIVE_SUBSCRIPTIONS", async () => {
    setVapidEnv(true);
    supabaseState.data = [];
    const { sendPendingOrdersPushToAdmins } = await loadSendWebPush();

    const result = await sendPendingOrdersPushToAdmins({ pendingCount: 1 });

    expect(result).toEqual({
      sent: 0,
      failed: 0,
      expired: 0,
      skipped: true,
      reason: "NO_ACTIVE_SUBSCRIPTIONS"
    });
  });

  it("un envio exitoso => sent 1 failed 0", async () => {
    setVapidEnv(true);
    supabaseState.data = [subscriptionRow("sub-1")];
    sendNotification.mockResolvedValueOnce(undefined);
    const { sendPendingOrdersPushToAdmins } = await loadSendWebPush();

    const result = await sendPendingOrdersPushToAdmins({ pendingCount: 1, pedidoId: "pedido-1" });

    expect(result).toEqual({ sent: 1, failed: 0, expired: 0, skipped: false });
  });

  it("todos los envios fallan => sent 0 failed > 0", async () => {
    setVapidEnv(true);
    supabaseState.data = [subscriptionRow("sub-1"), subscriptionRow("sub-2")];
    sendNotification.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 500 }));
    const { sendPendingOrdersPushToAdmins } = await loadSendWebPush();

    const result = await sendPendingOrdersPushToAdmins({ pendingCount: 1 });

    expect(result.sent).toBe(0);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.skipped).toBe(false);
  });

  it("404/410 marca la suscripcion como inactiva", async () => {
    setVapidEnv(true);
    supabaseState.data = [subscriptionRow("sub-expired")];
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    const { sendPendingOrdersPushToAdmins } = await loadSendWebPush();

    const result = await sendPendingOrdersPushToAdmins({ pendingCount: 1 });

    expect(result).toEqual({ sent: 0, failed: 0, expired: 1, skipped: false });
    expect(supabaseState.updateEq).toHaveBeenCalledWith({ is_active: false }, "sub-expired");
  });

  it("el payload esta en espanol y no contiene datos personales del cliente", async () => {
    setVapidEnv(true);
    supabaseState.data = [subscriptionRow("sub-1")];
    sendNotification.mockResolvedValueOnce(undefined);
    const { sendPendingOrdersPushToAdmins } = await loadSendWebPush();

    await sendPendingOrdersPushToAdmins({ pendingCount: 2, pedidoId: "pedido-1" });

    const [, payload] = sendNotification.mock.calls[0] as [unknown, string];
    expect(payload).toContain("Nuevo pedido en Smellme");
    expect(payload).toContain("Tienes un nuevo pedido pendiente de revisión.");
    expect(payload).toContain("https://smellme-store.vercel.app/admin/pedidos");
    expect(payload).not.toContain("perfume-store-");
    expect(payload).not.toMatch(/clienteNombre|telefono|direccion|precio|rut/i);
  });
});
