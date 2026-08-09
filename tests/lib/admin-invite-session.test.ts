import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAdminPasswordSession } from "@/lib/admin-invite-session";

function createAuth(options?: {
  setSessionError?: unknown;
  session?: unknown | null;
}) {
  return {
    setSession: vi.fn(async () => ({ error: options?.setSessionError ?? null })),
    getSession: vi.fn(async () => ({
      data: { session: options?.session === undefined ? { user: { id: "admin-1" } } : options.session },
      error: null
    }))
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sesión implicit de invitación administrativa", () => {
  it("consume access_token + refresh_token con setSession y luego elimina el fragmento", async () => {
    const clearFragment = vi.fn();
    const auth = createAuth();
    auth.setSession.mockImplementationOnce(async () => {
      expect(clearFragment).not.toHaveBeenCalled();
      return { error: null };
    });

    const ready = await resolveAdminPasswordSession(
      auth,
      "#access_token=access-test&refresh_token=refresh-test&type=invite",
      clearFragment
    );

    expect(ready).toBe(true);
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: "access-test",
      refresh_token: "refresh-test"
    });
    expect(clearFragment).toHaveBeenCalledOnce();
    expect(auth.getSession).toHaveBeenCalledOnce();
  });

  it("hash con tokens inválidos se limpia y muestra enlace inválido", async () => {
    const clearFragment = vi.fn();
    const auth = createAuth({ setSessionError: new Error("invalid") });
    const ready = await resolveAdminPasswordSession(
      auth,
      "#access_token=invalid&refresh_token=invalid&type=invite",
      clearFragment
    );
    expect(ready).toBe(false);
    expect(clearFragment).toHaveBeenCalledOnce();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("hash incompleto se rechaza sin intentar crear sesión", async () => {
    const clearFragment = vi.fn();
    const auth = createAuth();
    const ready = await resolveAdminPasswordSession(
      auth,
      "#access_token=only-one-token&type=invite",
      clearFragment
    );
    expect(ready).toBe(false);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(clearFragment).toHaveBeenCalledOnce();
  });

  it("sin hash ni sesión muestra enlace inválido", async () => {
    const auth = createAuth({ session: null });
    expect(await resolveAdminPasswordSession(auth, "", vi.fn())).toBe(false);
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("mantiene soporte para una sesión ya existente sin hash", async () => {
    const auth = createAuth();
    expect(await resolveAdminPasswordSession(auth, "", vi.fn())).toBe(true);
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("nunca escribe tokens en logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await resolveAdminPasswordSession(
      createAuth(),
      "#access_token=secret-access&refresh_token=secret-refresh&type=invite",
      vi.fn()
    );
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
