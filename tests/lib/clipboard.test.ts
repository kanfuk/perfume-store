import { describe, expect, it, vi } from "vitest";
import { copyTextWithFallback } from "@/lib/clipboard";

describe("copiar mensaje", () => {
  it("usa Clipboard API cuando está disponible", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyTextWithFallback("mensaje", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("mensaje");
  });

  it("usa selección local si Clipboard API falla", async () => {
    const textarea = { value: "", style: {}, setAttribute: vi.fn(), select: vi.fn(), remove: vi.fn() };
    const documentRef = { body: { appendChild: vi.fn() }, createElement: vi.fn(() => textarea), execCommand: vi.fn(() => true) };
    const copied = await copyTextWithFallback("mensaje", { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, documentRef as never);
    expect(copied).toBe(true);
    expect(textarea.select).toHaveBeenCalled();
    expect(documentRef.execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.remove).toHaveBeenCalled();
  });

  it("informa fallo sin Clipboard API ni documento", async () => {
    expect(await copyTextWithFallback("mensaje")).toBe(false);
  });
});
