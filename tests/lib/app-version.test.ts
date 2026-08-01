import packageJson from "../../package.json";
import { describe, expect, it } from "vitest";
import { appInfo } from "@/lib/app-info";

describe("versión de release", () => {
  it("mantiene package y metadata sincronizados", () => {
    expect(packageJson.version).toBe("2.0.0-rc.3");
    expect(appInfo.version).toBe(packageJson.version);
  });
});
