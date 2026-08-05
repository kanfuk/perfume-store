import { describe, expect, it, vi } from "vitest";
import { runBulkImageUploadQueue } from "@/lib/product-image-bulk-queue";
import type { BulkQueueItemState, BulkQueueJob } from "@/lib/product-image-bulk-types";

function job(fileId: string, productId: string = `product-${fileId}`): BulkQueueJob {
  return { fileId, productId, action: "UPLOAD" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("runBulkImageUploadQueue - concurrencia", () => {
  it("nunca ejecuta mas de 2 uploads simultaneos", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const uploadFn = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { imageUrl: "url", imageStoragePath: "path" };
    });

    const jobs = Array.from({ length: 6 }, (_, i) => job(String(i)));
    await runBulkImageUploadQueue(jobs, { uploadFn, concurrency: 2 });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(uploadFn).toHaveBeenCalledTimes(6);
  });

  it("nunca supera 2 aunque se pida mas concurrencia (limite duro del proyecto)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const uploadFn = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { imageUrl: "url", imageStoragePath: "path" };
    });

    const jobs = Array.from({ length: 5 }, (_, i) => job(String(i)));
    await runBulkImageUploadQueue(jobs, { uploadFn, concurrency: 10 });

    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});

describe("runBulkImageUploadQueue - exito y fallo", () => {
  it("exito individual", async () => {
    const uploadFn = vi.fn(async () => ({ imageUrl: "url", imageStoragePath: "path" }));
    const results = await runBulkImageUploadQueue([job("a")], { uploadFn });
    expect(results).toEqual([
      { fileId: "a", productId: "product-a", action: "UPLOAD", state: "SUCCESS", data: { imageUrl: "url", imageStoragePath: "path" } }
    ]);
  });

  it("fallo individual con mensaje seguro, sin detener el resto", async () => {
    const uploadFn = vi.fn(async (j: BulkQueueJob) => {
      if (j.fileId === "b") throw new Error("Producto no encontrado.");
      return { imageUrl: "url", imageStoragePath: "path" };
    });

    const results = await runBulkImageUploadQueue([job("a"), job("b"), job("c")], { uploadFn, concurrency: 1 });

    expect(results.find((r) => r.fileId === "a")?.state).toBe("SUCCESS");
    expect(results.find((r) => r.fileId === "b")).toEqual(
      expect.objectContaining({ fileId: "b", state: "FAILED", error: "Producto no encontrado." })
    );
    expect(results.find((r) => r.fileId === "c")?.state).toBe("SUCCESS");
  });

  it("lote mixto: exitos y fallos aislados no afectan el conteo final", async () => {
    const uploadFn = vi.fn(async (j: BulkQueueJob) => {
      if (Number(j.fileId) % 2 === 0) throw new Error("falla");
      return { imageUrl: "url", imageStoragePath: "path" };
    });

    const jobs = Array.from({ length: 6 }, (_, i) => job(String(i)));
    const results = await runBulkImageUploadQueue(jobs, { uploadFn });

    expect(results.filter((r) => r.state === "SUCCESS")).toHaveLength(3);
    expect(results.filter((r) => r.state === "FAILED")).toHaveLength(3);
  });

  it("no reintenta automaticamente un job fallido", async () => {
    const uploadFn = vi.fn(async () => {
      throw new Error("falla");
    });
    await runBulkImageUploadQueue([job("a")], { uploadFn });
    expect(uploadFn).toHaveBeenCalledTimes(1);
  });

  it("reintentar fallidos: una segunda llamada solo con los jobs fallidos nunca reenvia los exitosos", async () => {
    const attempted: string[] = [];
    const uploadFn = vi.fn(async (j: BulkQueueJob) => {
      attempted.push(j.fileId);
      if (j.fileId === "b") throw new Error("falla");
      return { imageUrl: "url", imageStoragePath: "path" };
    });

    const firstRun = await runBulkImageUploadQueue([job("a"), job("b")], { uploadFn });
    const failedJobs = firstRun.filter((r) => r.state === "FAILED").map((r) => job(r.fileId, r.productId));
    expect(failedJobs.map((j) => j.fileId)).toEqual(["b"]);

    await runBulkImageUploadQueue(failedJobs, { uploadFn });

    expect(attempted).toEqual(["a", "b", "b"]);
  });
});

describe("runBulkImageUploadQueue - progreso", () => {
  it("notifica UPLOADING y luego el estado final para cada job", async () => {
    const transitions: Array<{ fileId: string; state: BulkQueueItemState }> = [];
    const uploadFn = vi.fn(async () => ({ imageUrl: "url", imageStoragePath: "path" }));

    await runBulkImageUploadQueue([job("a"), job("b")], {
      uploadFn,
      concurrency: 1,
      onItemStateChange: (j, state) => transitions.push({ fileId: j.fileId, state })
    });

    expect(transitions).toEqual([
      { fileId: "a", state: "UPLOADING" },
      { fileId: "a", state: "SUCCESS" },
      { fileId: "b", state: "UPLOADING" },
      { fileId: "b", state: "SUCCESS" }
    ]);
  });
});

describe("runBulkImageUploadQueue - cancelacion", () => {
  it("cancela solo lo aun no iniciado; lo que ya esta en vuelo termina normalmente", async () => {
    const startedFirst = deferred<void>();
    let cancelled = false;
    const uploadFn = vi.fn(async (j: BulkQueueJob) => {
      if (j.fileId === "a") {
        startedFirst.resolve();
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return { imageUrl: "url", imageStoragePath: "path" };
    });

    const runPromise = runBulkImageUploadQueue([job("a"), job("b"), job("c")], {
      uploadFn,
      concurrency: 1,
      isCancelled: () => cancelled
    });

    await startedFirst.promise;
    cancelled = true;

    const results = await runPromise;

    expect(results.find((r) => r.fileId === "a")?.state).toBe("SUCCESS");
    expect(results.find((r) => r.fileId === "b")?.state).toBe("SKIPPED");
    expect(results.find((r) => r.fileId === "c")?.state).toBe("SKIPPED");
    expect(uploadFn).toHaveBeenCalledTimes(1);
  });
});
