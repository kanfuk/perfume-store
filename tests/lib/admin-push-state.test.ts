import { describe, expect, it } from "vitest";
import {
  dismissAdminPushPrompt,
  getAdminPushPromptKind,
  isAdminPushPromptDismissed,
  shouldRequestNotificationPermission
} from "@/lib/pwa/admin-push-state";

describe("estado UX de Push administrativo", () => {
  it("Push activo no muestra panel en Dashboard", () => {
    expect(
      getAdminPushPromptKind({
        loaded: true,
        pushSupported: true,
        permission: "granted",
        subscriptionActive: true
      })
    ).toBeNull();
  });

  it("permission default muestra activacion y denied muestra bloqueo", () => {
    expect(
      getAdminPushPromptKind({
        loaded: true,
        pushSupported: true,
        permission: "default",
        subscriptionActive: false
      })
    ).toBe("activate");
    expect(
      getAdminPushPromptKind({
        loaded: true,
        pushSupported: true,
        permission: "denied",
        subscriptionActive: false
      })
    ).toBe("blocked");
  });

  it("granted sin suscripcion ofrece reparacion y no compatible se distingue", () => {
    expect(
      getAdminPushPromptKind({
        loaded: true,
        pushSupported: true,
        permission: "granted",
        subscriptionActive: false
      })
    ).toBe("repair");
    expect(
      getAdminPushPromptKind({
        loaded: true,
        pushSupported: false,
        permission: "unsupported",
        subscriptionActive: false
      })
    ).toBe("unsupported");
  });

  it("solo solicita permiso cuando sigue en default", () => {
    expect(shouldRequestNotificationPermission("default")).toBe(true);
    expect(shouldRequestNotificationPermission("denied")).toBe(false);
    expect(shouldRequestNotificationPermission("granted")).toBe(false);
    expect(shouldRequestNotificationPermission("unsupported")).toBe(false);
  });

  it("Ahora no persiste durante la sesion", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };

    expect(isAdminPushPromptDismissed(storage)).toBe(false);
    dismissAdminPushPrompt(storage);
    expect(isAdminPushPromptDismissed(storage)).toBe(true);
  });
});
