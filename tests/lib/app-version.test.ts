import packageJson from "../../package.json";
import { describe, expect, it } from "vitest";
import { appInfo } from "@/lib/app-info";

describe("versión de release", () => {
  it("mantiene package y metadata sincronizados", () => {
    expect(packageJson.version).toBe("2.2.0");
    expect(appInfo.version).toBe(packageJson.version);
    expect(packageJson.dependencies.next).toBe("16.2.12");
    expect(packageJson.dependencies.sharp).toBe("0.35.3");
    expect(packageJson.devDependencies.postcss).toBe("8.5.25");
    expect(packageJson.overrides).toEqual({ postcss: "$postcss", sharp: "$sharp" });
  });
});
