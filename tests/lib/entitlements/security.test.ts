import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests de seguridad de la integracion de entitlement (Fase 7A, seccion 38
 * del encargo). Combinan inspeccion de codigo fuente (para garantias
 * estructurales: nada de esto puede colarse en el bundle de cliente) con
 * pruebas de comportamiento (logging real, SSRF, malformed response).
 */

const ENTITLEMENTS_DIR = "lib/entitlements";
const IGNORED_DIR_NAMES = new Set(["node_modules", ".next", ".git", "tests", ".claude"]);

function listSourceFiles(rootDir: string): string[] {
  const results: string[] = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of readdirSync(current)) {
      if (IGNORED_DIR_NAMES.has(entry)) continue;
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function readAllEntitlementSources(): Record<string, string> {
  const files = readdirSync(ENTITLEMENTS_DIR).filter((name) => name.endsWith(".ts"));
  return Object.fromEntries(files.map((name) => [name, readFileSync(`${ENTITLEMENTS_DIR}/${name}`, "utf8")]));
}

/** Quita comentarios de bloque y de linea antes de buscar patrones "prohibidos" en codigo real (evita falsos positivos contra la propia documentacion que describe la regla). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
}

describe("entitlements - seguridad estructural (analisis de codigo fuente)", () => {
  const sources = readAllEntitlementSources();

  it("todo archivo de lib/entitlements/ importa 'server-only' (nunca puede colarse en un Client Component)", () => {
    for (const [name, content] of Object.entries(sources)) {
      expect(content, `${name} debe importar "server-only"`).toMatch(/import ["']server-only["'];?/);
    }
  });

  it("ningun componente cliente ('use client') del repo importa lib/entitlements", () => {
    const candidates = [...listSourceFiles("components"), ...listSourceFiles("app")].filter((path) => {
      const content = readFileSync(path, "utf8");
      return content.includes("lib/entitlements");
    });

    for (const file of candidates) {
      const content = readFileSync(file, "utf8");
      expect(
        content.trimStart().startsWith('"use client"'),
        `${file} es "use client" pero importa lib/entitlements`
      ).toBe(false);
    }
  });

  it("ningun archivo usa NEXT_PUBLIC_ para el token o la URL de Control", () => {
    for (const content of Object.values(sources)) {
      expect(content).not.toMatch(/NEXT_PUBLIC_RIEDMANN/i);
    }
    const envExample = readFileSync(".env.example", "utf8");
    expect(envExample).toMatch(/^RIEDMANN_APPS_CONTROL_URL=/m);
    expect(envExample).toMatch(/^RIEDMANN_APPS_INSTALLATION_TOKEN=/m);
    // NEXT_PUBLIC_RIEDMANNS_WHATSAPP_NUMBER es una variable preexistente y
    // legitimamente publica (numero de WhatsApp), no relacionada con
    // Control -- solo se prohibe el prefijo especifico de Control.
    expect(envExample).not.toMatch(/NEXT_PUBLIC_RIEDMANN_APPS/);
  });

  it("EntitlementNotice nunca usa innerHTML/dangerouslySetInnerHTML (el notice de Control se renderiza como texto plano)", () => {
    const notice = stripComments(readFileSync("components/admin/EntitlementNotice.tsx", "utf8"));
    expect(notice).not.toContain("dangerouslySetInnerHTML");
    expect(notice).not.toContain("innerHTML");
  });

  it("SuspendedAdminScreen no muestra monto, referencias de pago, IDs internos ni email del OWNER", () => {
    const screen = stripComments(readFileSync("components/admin/SuspendedAdminScreen.tsx", "utf8"));
    expect(screen).not.toMatch(/monto|amount|paymentReference|clientId|subscriptionId|OWNER_EMAIL|email/i);
  });

  it("la variante configuration-error no expone nombre de variable, token, URL interna ni stack trace", () => {
    const screen = stripComments(readFileSync("components/admin/SuspendedAdminScreen.tsx", "utf8"));
    expect(screen).not.toMatch(/RIEDMANN_APPS_CONTROL_URL|RIEDMANN_APPS_INSTALLATION_TOKEN/);
    expect(screen).not.toMatch(/stack|Error:|\.riedmannapps\.com/i);
  });

  it("client.ts es el UNICO archivo que referencia el path de la entitlement API", () => {
    const allSources = [
      ...listSourceFiles("app"),
      ...listSourceFiles("components"),
      ...listSourceFiles("lib"),
      ...listSourceFiles("services"),
      ...listSourceFiles("repositories")
    ];
    const referencing = allSources.filter((path) => stripComments(readFileSync(path, "utf8")).includes("entitlements/check"));
    expect(referencing).toEqual(["lib/entitlements/client.ts"]);
  });
});

describe("entitlements - SSRF (seccion 30 del encargo)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getEntitlementConfig SOLO lee process.env: la firma no acepta ningun parametro externo", () => {
    const source = readFileSync("lib/entitlements/config.ts", "utf8");
    const fnMatch = source.match(/export function getEntitlementConfig\(([^)]*)\)/);
    expect(fnMatch?.[1].trim()).toBe("");
  });

  it("una URL de Control no-HTTPS es rechazada (protege contra downgrade a HTTP)", async () => {
    const { getEntitlementConfig } = await import("@/lib/entitlements/config");
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "http://attacker.example.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "token");
    expect(getEntitlementConfig()).toBeNull();
  });

  it("no existe ningun proxy/route generico en app/api/ que reenvie una URL arbitraria a Control", () => {
    const apiFiles = listSourceFiles("app/api");
    const matches = apiFiles.filter((path) => readFileSync(path, "utf8").includes("RIEDMANN_APPS_CONTROL_URL"));
    expect(matches).toEqual([]);
  });
});

describe("entitlements - logging seguro (seccion 29/38)", () => {
  beforeEach(() => {
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "https://control.riedmannapps.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "SECRET-TOKEN-QUE-NUNCA-DEBE-APARECER");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logEntitlementEvent nunca imprime el token aunque se le pase un objeto con una clave sospechosa", async () => {
    const { logEntitlementEvent } = await import("@/lib/entitlements/logging");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logEntitlementEvent({
      event: "check",
      decision: "DENY",
      reason: "token-invalid",
      latencyMs: 12,
      // @ts-expect-error -- input adversarial deliberado para probar el filtro de sanitize()
      authorization: "Bearer SECRET-TOKEN-QUE-NUNCA-DEBE-APARECER"
    });

    const loggedText = infoSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(loggedText).not.toContain("SECRET-TOKEN-QUE-NUNCA-DEBE-APARECER");
  });

  it("el header Authorization jamas aparece en ningun console.* durante un check real (mock de fetch inspeccionado)", async () => {
    vi.resetModules();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 }))
    );

    const { getAdminEntitlement } = await import("@/lib/entitlements");
    await getAdminEntitlement();

    const allOutput = [...infoSpy.mock.calls, ...errorSpy.mock.calls, ...logSpy.mock.calls]
      .map((call) => call.join(" "))
      .join("\n");
    expect(allOutput).not.toContain("SECRET-TOKEN-QUE-NUNCA-DEBE-APARECER");
    expect(allOutput.toLowerCase()).not.toContain("bearer ");
    vi.unstubAllGlobals();
  });
});

describe("entitlements - malformed response nunca autoritativo (seccion 31)", () => {
  it("un 200 con body malformado no puede producir blocked:true por si solo (sin decision previa)", async () => {
    vi.resetModules();
    vi.stubEnv("RIEDMANN_APPS_CONTROL_URL", "https://control.riedmannapps.com");
    vi.stubEnv("RIEDMANN_APPS_INSTALLATION_TOKEN", "token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ decision: "DENY_TODO_MAL_FORMADO" }), { status: 200 }))
    );

    const { getAdminEntitlement } = await import("@/lib/entitlements");
    const decision = await getAdminEntitlement();

    expect(decision.blocked).toBe(false);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
