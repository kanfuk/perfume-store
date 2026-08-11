import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir),
      // El paquete `server-only` usa un export condicional ("react-server")
      // que solo el bundler de Next.js aplica; sin esto, Vitest resuelve al
      // stub que SIEMPRE lanza (incluso en Node/servidor). Se alias directo
      // al no-op (mismo archivo que usa Next.js en Server Components) en vez
      // de setear `resolve.conditions` globalmente, porque esa condicion
      // tambien cambia como se resuelve `react` (rompe createContext de
      // lucide-react en cualquier test que importe un componente con
      // iconos). Necesario a partir de lib/entitlements/* (Fase 7A).
      "server-only": path.resolve(rootDir, "node_modules/server-only/empty.js")
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
