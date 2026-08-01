import { describe, expect, it } from "vitest";
import { runIncrementalBatch } from "@/lib/image-assistant/batch";

describe("incremental image assistant batch", () => {
  it("nunca procesa más de dos productos simultáneos", async () => {
    let active = 0; let maximum = 0;
    await runIncrementalBatch({ items: [1, 2, 3, 4], keyOf: String, completed: new Set(), shouldContinue: () => true, process: async () => { active += 1; maximum = Math.max(maximum, active); await Promise.resolve(); active -= 1; } });
    expect(maximum).toBe(2);
  });
  it("omite completados al reanudar", async () => {
    const seen: number[] = [];
    const result = await runIncrementalBatch({ items: [1, 2, 3], keyOf: String, completed: new Set(["1", "2"]), shouldContinue: () => true, process: async (item) => { seen.push(item); } });
    expect(seen).toEqual([3]); expect(result.skipped).toEqual(["1", "2"]);
  });
  it("se puede pausar y luego continuar sin repetir", async () => {
    let allowed = true; const first: number[] = [];
    await runIncrementalBatch({ items: [1, 2, 3, 4], keyOf: String, completed: new Set(), concurrency: 1, shouldContinue: () => allowed, process: async (item) => { first.push(item); allowed = false; } });
    const second: number[] = [];
    await runIncrementalBatch({ items: [1, 2, 3, 4], keyOf: String, completed: new Set(first.map(String)), concurrency: 1, shouldContinue: () => true, process: async (item) => { second.push(item); } });
    expect(first).toEqual([1]); expect(second).toEqual([2, 3, 4]);
  });
});
