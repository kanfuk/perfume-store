/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Cola de subida - carga masiva de imagenes (Fase 7.3)
 * Descripcion: Orquestador generico de concurrencia limitada, sin
 * conocimiento de fetch/FormData/Supabase -- recibe una funcion `uploadFn`
 * inyectada (una peticion por imagen, reutilizando el endpoint individual
 * /api/admin/products/[productId]/image) y solo controla CUANDO se llama y
 * cuantas llamadas hay en vuelo a la vez. Nunca empaqueta varios binarios en
 * una sola peticion, nunca mantiene una funcion serverless abierta: toda la
 * orquestacion vive en el navegador.
 */

import { BULK_PRODUCT_IMAGE_MAX_CONCURRENCY } from "@/lib/constants";
import type { BulkQueueItemState, BulkQueueJob, BulkQueueResult, BulkQueueSuccessData } from "@/lib/product-image-bulk-types";

export type RunBulkImageUploadQueueOptions = {
  /** Maximo de subidas simultaneas. Nunca superar el limite validado (2). */
  concurrency?: number;
  /** Sube UNA imagen para UN producto, reutilizando el endpoint individual. Nunca implementado aqui: lo inyecta el llamador (panel). */
  uploadFn: (job: BulkQueueJob) => Promise<BulkQueueSuccessData>;
  /** Notifica cada transicion de estado para reflejar progreso en vivo en la UI. */
  onItemStateChange?: (job: BulkQueueJob, state: BulkQueueItemState, result?: BulkQueueResult) => void;
  /**
   * Se consulta ANTES de iniciar cada job aun no comenzado. Si retorna true,
   * los jobs restantes quedan en estado SKIPPED (cancelados) -- los que ya
   * estan en vuelo (UPLOADING) SIEMPRE terminan normalmente, nunca se
   * abortan de forma insegura.
   */
  isCancelled?: () => boolean;
};

/**
 * Ejecuta `jobs` con un maximo de `concurrency` peticiones en vuelo. Un
 * fallo en un job aisla su propio resultado (FAILED) sin afectar a los
 * demas -- nunca se reintenta automaticamente. El llamador decide si vuelve
 * a invocar esta funcion solo con los jobs fallidos ("Reintentar fallidos").
 */
export async function runBulkImageUploadQueue(
  jobs: readonly BulkQueueJob[],
  options: RunBulkImageUploadQueueOptions
): Promise<BulkQueueResult[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? BULK_PRODUCT_IMAGE_MAX_CONCURRENCY, BULK_PRODUCT_IMAGE_MAX_CONCURRENCY));
  const results: BulkQueueResult[] = new Array(jobs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= jobs.length) return;

      const job = jobs[currentIndex];

      if (options.isCancelled?.()) {
        const skipped: BulkQueueResult = { fileId: job.fileId, productId: job.productId, action: job.action, state: "SKIPPED" };
        results[currentIndex] = skipped;
        options.onItemStateChange?.(job, "SKIPPED", skipped);
        continue;
      }

      options.onItemStateChange?.(job, "UPLOADING");

      try {
        const data = await options.uploadFn(job);
        const success: BulkQueueResult = { fileId: job.fileId, productId: job.productId, action: job.action, state: "SUCCESS", data };
        results[currentIndex] = success;
        options.onItemStateChange?.(job, "SUCCESS", success);
      } catch (error) {
        const failed: BulkQueueResult = {
          fileId: job.fileId,
          productId: job.productId,
          action: job.action,
          state: "FAILED",
          error: error instanceof Error ? error.message : "Error interno al subir la imagen."
        };
        results[currentIndex] = failed;
        options.onItemStateChange?.(job, "FAILED", failed);
      }
    }
  }

  const workerCount = Math.min(concurrency, jobs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
