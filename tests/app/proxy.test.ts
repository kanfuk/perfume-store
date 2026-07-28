import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { getUser, createServerClient } = vi.hoisted(() => {
  const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
  const createServerClient = vi.fn(() => ({ auth: { getUser } }));
  return { getUser, createServerClient };
});

vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("@/lib/supabase/config", () => ({
  getSupabaseUrl: () => "https://example.supabase.co",
  getSupabasePublishableKey: () => "test-anon-key"
}));

import { proxy } from "@/proxy";

describe("proxy", () => {
  beforeEach(() => {
    getUser.mockClear();
    createServerClient.mockClear();
  });

  it("deja pasar /admin/set-password sin crear un cliente de Supabase", async () => {
    const request = new NextRequest("http://localhost:3000/admin/set-password");

    await proxy(request);

    expect(createServerClient).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("deja pasar /admin/login sin crear un cliente de Supabase", async () => {
    const request = new NextRequest("http://localhost:3000/admin/login");

    await proxy(request);

    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("sigue refrescando la sesion para el resto de rutas /admin protegidas", async () => {
    const request = new NextRequest("http://localhost:3000/admin");

    await proxy(request);

    expect(createServerClient).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
