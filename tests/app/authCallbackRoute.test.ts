import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { exchangeCodeForSession } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn()
}));

vi.mock("@/lib/supabase/auth-server", () => ({
  createSupabaseAuthServerClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession }
  }))
}));

import { GET } from "@/app/auth/callback/route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
  });

  it("redirige a /admin/set-password sin llamar a Supabase cuando falta el code", async () => {
    const request = new NextRequest("http://localhost:3000/auth/callback");

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/set-password");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirige a /admin/set-password sin exponer detalles cuando el canje falla", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid_grant" } });
    const request = new NextRequest("http://localhost:3000/auth/callback?code=codigo-invalido");

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/set-password");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("codigo-invalido");
  });

  it("redirige a /admin/set-password sin exponer detalles cuando el canje lanza una excepcion", async () => {
    exchangeCodeForSession.mockRejectedValue(new Error("network down"));
    const request = new NextRequest("http://localhost:3000/auth/callback?code=algun-codigo");

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/set-password");
  });

  it("redirige a /admin/set-password tras un canje exitoso", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const request = new NextRequest("http://localhost:3000/auth/callback?code=codigo-valido");

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/admin/set-password");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("codigo-valido");
  });
});
