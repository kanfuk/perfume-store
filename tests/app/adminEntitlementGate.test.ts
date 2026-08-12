import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedAdmin } = vi.hoisted(() => ({ getAuthenticatedAdmin: vi.fn() }));
const { getAdminEntitlement } = vi.hoisted(() => ({ getAdminEntitlement: vi.fn() }));

vi.mock("@/lib/admin-auth", () => ({ getAuthenticatedAdmin }));
vi.mock("@/lib/entitlements", () => ({ getAdminEntitlement }));
vi.mock("@/components/admin/AdminPwaInitializer", () => ({ AdminPwaInitializer: () => null }));

import AdminLayout from "@/app/admin/layout";
import { SuspendedAdminScreen } from "@/components/admin/SuspendedAdminScreen";
import { EntitlementNotice } from "@/components/admin/EntitlementNotice";

type ReactNodeLike = { type?: unknown; props?: { children?: unknown } } | ReactNodeLike[] | string | null | undefined;

/** Recorre el arbol de elementos React devuelto por un Server Component (sin renderer, solo inspeccion de objetos). */
function collectTypes(node: ReactNodeLike, found: Set<unknown> = new Set()): Set<unknown> {
  if (node === null || node === undefined) return found;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, found);
    return found;
  }
  if (typeof node === "string") return found;
  found.add(node.type);
  if (node.props && "children" in node.props) collectTypes(node.props.children as ReactNodeLike, found);
  return found;
}

function containsRef(node: ReactNodeLike, target: unknown): boolean {
  if (node === target) return true;
  if (node === null || node === undefined || typeof node === "string") return false;
  if (Array.isArray(node)) return node.some((item) => containsRef(item, target));
  if (node.props && "children" in node.props) return containsRef(node.props.children as ReactNodeLike, target);
  return false;
}

/** Encuentra el primer elemento de un tipo dado y devuelve sus props completas (para inspeccionar, ej. `variant`). */
function findFirstByType(node: ReactNodeLike, type: unknown): { type?: unknown; props?: Record<string, unknown> } | null {
  if (node === null || node === undefined || typeof node === "string") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstByType(item, type);
      if (found) return found;
    }
    return null;
  }
  if (node.type === type) return node as { type?: unknown; props?: Record<string, unknown> };
  if (node.props && "children" in node.props) return findFirstByType(node.props.children as ReactNodeLike, type);
  return null;
}

describe("app/admin/layout.tsx - gate central de entitlement (Fase 7A)", () => {
  const PANEL_MARKER = { __marker: "panel-content" };

  beforeEach(() => {
    getAuthenticatedAdmin.mockReset();
    getAdminEntitlement.mockReset();
  });

  it("visitante sin sesion (incluida /admin/login): NUNCA llama a getAdminEntitlement, children pasan intactos", async () => {
    getAuthenticatedAdmin.mockResolvedValue(null);

    const result = await AdminLayout({ children: PANEL_MARKER as never });

    expect(getAdminEntitlement).not.toHaveBeenCalled();
    expect(containsRef(result, PANEL_MARKER)).toBe(true);
    expect(collectTypes(result).has(SuspendedAdminScreen)).toBe(false);
  });

  it("admin autenticado + ACTIVE (blocked:false, sin notice): admin disponible, sin banner", async () => {
    getAuthenticatedAdmin.mockResolvedValue({ userId: "u1", profileId: "p1", rol: "ADMIN" });
    getAdminEntitlement.mockResolvedValue({ blocked: false, notice: null, reason: "authoritative-allow" });

    const result = await AdminLayout({ children: PANEL_MARKER as never });

    expect(getAdminEntitlement).toHaveBeenCalledTimes(1);
    expect(containsRef(result, PANEL_MARKER)).toBe(true);
    expect(collectTypes(result).has(SuspendedAdminScreen)).toBe(false);
    expect(collectTypes(result).has(EntitlementNotice)).toBe(false);
  });

  it("admin autenticado + OVERDUE (blocked:false, sin notice): admin disponible, sin bloquear", async () => {
    getAuthenticatedAdmin.mockResolvedValue({ userId: "u1", profileId: "p1", rol: "ADMIN" });
    getAdminEntitlement.mockResolvedValue({ blocked: false, notice: null, reason: "authoritative-allow" });

    const result = await AdminLayout({ children: PANEL_MARKER as never });

    expect(containsRef(result, PANEL_MARKER)).toBe(true);
    expect(collectTypes(result).has(SuspendedAdminScreen)).toBe(false);
  });

  it("admin autenticado + GRACE_PERIOD (blocked:false + notice): admin disponible Y banner discreto visible", async () => {
    const notice = { severity: "warning", code: "GRACE_PERIOD", title: "Mensualidad pendiente", message: "Regulariza el pago." };
    getAuthenticatedAdmin.mockResolvedValue({ userId: "u1", profileId: "p1", rol: "ADMIN" });
    getAdminEntitlement.mockResolvedValue({ blocked: false, notice, reason: "authoritative-allow" });

    const result = await AdminLayout({ children: PANEL_MARKER as never });

    expect(containsRef(result, PANEL_MARKER)).toBe(true);
    expect(collectTypes(result).has(EntitlementNotice)).toBe(true);
    expect(collectTypes(result).has(SuspendedAdminScreen)).toBe(false);
  });

  it("admin autenticado + SUSPENDED ADMIN_ONLY (blocked:true): admin BLOQUEADO, children NUNCA se renderizan", async () => {
    getAuthenticatedAdmin.mockResolvedValue({ userId: "u1", profileId: "p1", rol: "ADMIN" });
    getAdminEntitlement.mockResolvedValue({ blocked: true, notice: null, reason: "authoritative-deny" });

    const result = await AdminLayout({ children: PANEL_MARKER as never });

    expect(containsRef(result, PANEL_MARKER)).toBe(false);
    expect(collectTypes(result).has(SuspendedAdminScreen)).toBe(true);
  });

  it("admin autenticado + 401/token-invalid: FAIL CLOSED, admin bloqueado igual que un DENY autoritativo", async () => {
    getAuthenticatedAdmin.mockResolvedValue({ userId: "u1", profileId: "p1", rol: "ADMIN" });
    getAdminEntitlement.mockResolvedValue({ blocked: true, notice: null, reason: "token-invalid" });

    const result = await AdminLayout({ children: PANEL_MARKER as never });

    expect(containsRef(result, PANEL_MARKER)).toBe(false);
    expect(collectTypes(result).has(SuspendedAdminScreen)).toBe(true);
  });

  it("configuration-error (Production sin config): admin BLOQUEADO con la variante correcta, distinta de 'suspended'", async () => {
    getAuthenticatedAdmin.mockResolvedValue({ userId: "u1", profileId: "p1", rol: "ADMIN" });
    getAdminEntitlement.mockResolvedValue({ blocked: true, notice: null, reason: "configuration-error" });

    const result = await AdminLayout({ children: PANEL_MARKER as never });

    expect(containsRef(result, PANEL_MARKER)).toBe(false);
    const screen = findFirstByType(result, SuspendedAdminScreen);
    expect(screen?.props?.variant).toBe("configuration-error");
  });

  it("SUSPENDED autoritativo usa la variante 'suspended' (no 'configuration-error')", async () => {
    getAuthenticatedAdmin.mockResolvedValue({ userId: "u1", profileId: "p1", rol: "ADMIN" });
    getAdminEntitlement.mockResolvedValue({ blocked: true, notice: null, reason: "authoritative-deny" });

    const result = await AdminLayout({ children: PANEL_MARKER as never });

    const screen = findFirstByType(result, SuspendedAdminScreen);
    expect(screen?.props?.variant).toBe("suspended");
  });

  it("503/timeout con fail-open (blocked:false): admin disponible igual, no distinto de ACTIVE para la UI", async () => {
    getAuthenticatedAdmin.mockResolvedValue({ userId: "u1", profileId: "p1", rol: "ADMIN" });
    getAdminEntitlement.mockResolvedValue({ blocked: false, notice: null, reason: "dependency-error-fail-open-no-previous" });

    const result = await AdminLayout({ children: PANEL_MARKER as never });

    expect(containsRef(result, PANEL_MARKER)).toBe(true);
    expect(collectTypes(result).has(SuspendedAdminScreen)).toBe(false);
  });

  it("SuspendedAdminScreen no cierra sesion ni toca Supabase Auth (seccion 26): sin imports de signOut/cookies", () => {
    const source = readFileSync("components/admin/SuspendedAdminScreen.tsx", "utf8");
    expect(source).not.toMatch(/signOut|clearSession|cookies\(\)|supabase\.auth/i);
    const layoutSource = readFileSync("app/admin/layout.tsx", "utf8");
    expect(layoutSource).not.toMatch(/signOut|clearSession|\.auth\.signOut/i);
  });

  it("el storefront publico (app/page.tsx) nunca importa lib/entitlements: estructuralmente inmune a ADMIN_ONLY", () => {
    const homeSource = readFileSync("app/page.tsx", "utf8");
    expect(homeSource).not.toContain("lib/entitlements");
    const orderFormSource = readFileSync("components/OrderForm.tsx", "utf8");
    expect(orderFormSource).not.toContain("lib/entitlements");
  });

  it("accesibilidad: EntitlementNotice usa role=status/aria-live y no depende solo del color (icono + texto)", () => {
    const source = readFileSync("components/admin/EntitlementNotice.tsx", "utf8");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-hidden="true"');
  });

  it("accesibilidad: SuspendedAdminScreen tiene un unico h1 y no requiere manejo de foco (sin controles interactivos)", () => {
    const source = readFileSync("components/admin/SuspendedAdminScreen.tsx", "utf8");
    expect(source.match(/<h1[\s>]/g)?.length).toBe(1);
    expect(source).not.toMatch(/<button|<a\s|<input|<select/);
  });

  it("el gate vive en un unico punto central (app/admin/layout.tsx), no en cada pagina", () => {
    const layoutSource = readFileSync("app/admin/layout.tsx", "utf8");
    expect(layoutSource).toContain("getAdminEntitlement");
    // Ninguna pagina individual de /admin/* debe importar el gate: eso
    // reintroduciria la duplicacion que la seccion 18 del encargo pide evitar.
    const adminPageSource = readFileSync("app/admin/page.tsx", "utf8");
    expect(adminPageSource).not.toContain("lib/entitlements");
    const pedidosPageSource = readFileSync("app/admin/pedidos/page.tsx", "utf8");
    expect(pedidosPageSource).not.toContain("lib/entitlements");
  });
});
