import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ImageAssistantAttemptInput = {
  productId: string;
  sourceUrl: string;
  normalizedSourceUrl: string;
  sourceDomain: string;
  score: number;
  reasons: string[];
};

export interface ImageAssistantAttemptRepository {
  start(input: ImageAssistantAttemptInput): Promise<void>;
  isHashAlreadyApplied(sha256: string, productId: string): Promise<boolean>;
  markApplied(normalizedSourceUrl: string, productId: string, sha256: string): Promise<void>;
  markError(normalizedSourceUrl: string, productId: string, code: string): Promise<void>;
}

const memoryAttempts = new Map<string, ImageAssistantAttemptInput & { status: string; sha256?: string }>();
const keyFor = (productId: string, normalizedSourceUrl: string) => `${productId}|${normalizedSourceUrl}`;

class MemoryImageAssistantAttemptRepository implements ImageAssistantAttemptRepository {
  async start(input: ImageAssistantAttemptInput) {
    memoryAttempts.set(keyFor(input.productId, input.normalizedSourceUrl), { ...input, status: "PROCESSING" });
  }
  async isHashAlreadyApplied(sha256: string, productId: string) {
    return [...memoryAttempts.values()].some(
      (attempt) => attempt.sha256 === sha256 && attempt.status === "APPLIED" && attempt.productId !== productId
    );
  }
  async markApplied(normalizedSourceUrl: string, productId: string, sha256: string) {
    const key = keyFor(productId, normalizedSourceUrl);
    const current = memoryAttempts.get(key);
    if (current) memoryAttempts.set(key, { ...current, status: "APPLIED", sha256 });
  }
  async markError(normalizedSourceUrl: string, productId: string) {
    const key = keyFor(productId, normalizedSourceUrl);
    const current = memoryAttempts.get(key);
    if (current) memoryAttempts.set(key, { ...current, status: "ERROR" });
  }
}

class SupabaseImageAssistantAttemptRepository implements ImageAssistantAttemptRepository {
  async start(input: ImageAssistantAttemptInput) {
    const { error } = await createSupabaseServerClient()
      .from("product_image_assistant_attempts")
      .upsert(
        {
          product_id: input.productId,
          source_url: input.sourceUrl,
          normalized_source_url: input.normalizedSourceUrl,
          source_domain: input.sourceDomain,
          score: input.score,
          reasons: input.reasons,
          status: "PROCESSING",
          error_code: null,
          completed_at: null
        },
        { onConflict: "product_id,normalized_source_url" }
      );
    if (error) throw new Error("No fue posible registrar el intento seguro de imagen.");
  }

  async isHashAlreadyApplied(sha256: string, productId: string) {
    const { data, error } = await createSupabaseServerClient()
      .from("product_image_assistant_attempts")
      .select("product_id")
      .eq("source_sha256", sha256)
      .eq("status", "APPLIED")
      .neq("product_id", productId)
      .limit(1);
    if (error) throw new Error("No fue posible validar la huella de la imagen.");
    return (data?.length ?? 0) > 0;
  }

  async markApplied(normalizedSourceUrl: string, productId: string, sha256: string) {
    const { error } = await createSupabaseServerClient()
      .from("product_image_assistant_attempts")
      .update({ status: "APPLIED", source_sha256: sha256, completed_at: new Date().toISOString() })
      .eq("product_id", productId)
      .eq("normalized_source_url", normalizedSourceUrl);
    if (error) throw new Error("No fue posible cerrar el registro de imagen aplicada.");
  }

  async markError(normalizedSourceUrl: string, productId: string, code: string) {
    await createSupabaseServerClient()
      .from("product_image_assistant_attempts")
      .update({ status: "ERROR", error_code: code, completed_at: new Date().toISOString() })
      .eq("product_id", productId)
      .eq("normalized_source_url", normalizedSourceUrl);
  }
}

export function getImageAssistantAttemptRepository(): ImageAssistantAttemptRepository {
  return isSupabaseConfigured()
    ? new SupabaseImageAssistantAttemptRepository()
    : new MemoryImageAssistantAttemptRepository();
}
