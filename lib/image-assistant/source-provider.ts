import crypto from "node:crypto";
import { IMAGE_SOURCE_DOMAINS, type ImageSourceDomainConfig } from "@/config/image-source-domains";
import { normalizeMatchKey } from "@/lib/catalog-import/normalization";
import { extractConcentration } from "./classification";
import type {
  ImageAssistantHealth,
  ImageAssistantItem,
  NormalizedImageSearchResult,
  SafeImageCandidate,
  SafeImageSourceAuthority
} from "./types";

const BRAVE_IMAGE_ENDPOINT = "https://api.search.brave.com/res/v1/images/search";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RESULT_LIMIT = 5;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export type ImageSearchOptions = {
  limit?: number;
  approvedDomain?: string;
  timeoutMs?: number;
};

export interface ImageSearchProvider<TResult = unknown> {
  isConfigured(): boolean;
  searchImages(query: string, options?: ImageSearchOptions): Promise<NormalizedImageSearchResult[]>;
  normalizeResult(result: TResult): NormalizedImageSearchResult | null;
  healthCheck(): { configured: boolean };
}

function cleanDomain(value: string): string | null {
  const domain = value.trim().toLowerCase().replace(/\.$/, "");
  if (!domain || domain.includes("*") || domain.includes("/") || domain.includes(":")) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) return null;
  return domain;
}

export function resolveAllowedDomainConfigs(
  raw = process.env.IMAGE_ASSISTANT_ALLOWED_DOMAINS ?? "",
  versioned: readonly ImageSourceDomainConfig[] = IMAGE_SOURCE_DOMAINS
): ImageSourceDomainConfig[] {
  const configured = new Set(raw.split(",").map(cleanDomain).filter((value): value is string => Boolean(value)));
  const versionedByDomain = new Map(versioned.map((entry) => [cleanDomain(entry.domain), entry]));
  return [...configured].map((domain) => {
    const entry = versionedByDomain.get(domain);
    return entry
      ? { ...entry, domain }
      : { domain, type: "APPROVED_RETAILER", enabled: true, notes: "Aprobado explícitamente mediante configuración de servidor." };
  });
}

export function getSafeImageAllowedDomains(): ReadonlySet<string> {
  return new Set(resolveAllowedDomainConfigs().filter((entry) => entry.enabled).map((entry) => entry.domain));
}

export function getImageAssistantHealth(): ImageAssistantHealth {
  return {
    providerConfigured: Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim()),
    signingSecretConfigured: Boolean(process.env.IMAGE_ASSISTANT_SIGNING_SECRET?.trim()),
    allowedDomainsConfigured: getSafeImageAllowedDomains().size > 0,
    searchEnabled: process.env.IMAGE_ASSISTANT_SEARCH_ENABLED === "true",
    batchEnabled: process.env.IMAGE_ASSISTANT_BATCH_ENABLED === "true"
  };
}

export function isSafeImageSearchConfigured(): boolean {
  const health = getImageAssistantHealth();
  return health.providerConfigured && health.signingSecretConfigured && health.allowedDomainsConfigured && health.searchEnabled;
}

function signaturePayload(candidate: SafeImageCandidate): string {
  return JSON.stringify({
    sourceUrl: candidate.sourceUrl,
    sourcePageUrl: candidate.sourcePageUrl ?? "",
    sourceDomain: candidate.sourceDomain,
    authority: candidate.authority,
    brand: candidate.brand,
    name: candidate.name,
    concentration: candidate.concentration,
    content: candidate.content,
    imageRole: candidate.imageRole
  });
}

export function signSafeImageCandidate(candidate: SafeImageCandidate): string {
  const secret = process.env.IMAGE_ASSISTANT_SIGNING_SECRET?.trim();
  if (!secret) throw new Error("La firma de candidatos seguros no está configurada.");
  return crypto.createHmac("sha256", secret).update(signaturePayload(candidate)).digest("base64url");
}

export function verifySafeImageCandidate(candidate: SafeImageCandidate): boolean {
  if (!candidate.token) return false;
  const expected = signSafeImageCandidate(candidate);
  const received = Buffer.from(candidate.token);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function safeHttpsUrl(value: unknown): URL | null {
  try {
    const url = new URL(stringValue(value));
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export class BraveImageSearchProvider implements ImageSearchProvider<Record<string, unknown>> {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  isConfigured(): boolean {
    return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());
  }

  healthCheck(): { configured: boolean } {
    return { configured: this.isConfigured() };
  }

  normalizeResult(result: Record<string, unknown>): NormalizedImageSearchResult | null {
    const properties = result.properties && typeof result.properties === "object"
      ? result.properties as Record<string, unknown>
      : {};
    const thumbnail = result.thumbnail && typeof result.thumbnail === "object"
      ? result.thumbnail as Record<string, unknown>
      : {};
    const imageUrl = safeHttpsUrl(properties.url ?? result.imageUrl ?? result.url);
    const sourcePageUrl = safeHttpsUrl(result.url ?? result.sourcePageUrl ?? result.page_url);
    if (!imageUrl || !sourcePageUrl) return null;
    return {
      sourcePageUrl: sourcePageUrl.toString(),
      imageUrl: imageUrl.toString(),
      thumbnailUrl: safeHttpsUrl(thumbnail.src ?? result.thumbnailUrl)?.toString(),
      title: stringValue(result.title),
      sourceDomain: sourcePageUrl.hostname.toLowerCase().replace(/\.$/, ""),
      width: positiveInteger(properties.width ?? result.width),
      height: positiveInteger(properties.height ?? result.height)
    };
  }

  async searchImages(query: string, options: ImageSearchOptions = {}): Promise<NormalizedImageSearchResult[]> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
    if (!apiKey) throw new Error("El proveedor de búsqueda no está configurado.");
    if (process.env.IMAGE_ASSISTANT_SEARCH_ENABLED !== "true") {
      throw new Error("La búsqueda de imágenes está deshabilitada.");
    }
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_RESULT_LIMIT, 1), 20);
    const url = new URL(BRAVE_IMAGE_ENDPOINT);
    const domain = options.approvedDomain ? cleanDomain(options.approvedDomain) : null;
    url.searchParams.set("q", `${query.trim()}${domain ? ` site:${domain}` : ""}`.slice(0, 400));
    url.searchParams.set("count", String(limit));
    url.searchParams.set("safesearch", "strict");

    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      try {
        response = await this.fetcher(url, {
          method: "GET",
          headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
          cache: "no-store",
          signal: controller.signal
        });
      } catch (error) {
        if (attempt === 0) continue;
        throw new Error(error instanceof DOMException && error.name === "AbortError"
          ? "El proveedor agotó el tiempo de espera."
          : "El proveedor de búsqueda no está disponible.");
      } finally {
        clearTimeout(timeout);
      }
      if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt === 1) break;
    }
    if (!response?.ok) {
      if (response?.status === 401 || response?.status === 403) throw new Error("El proveedor rechazó la autenticación.");
      if (response?.status === 429) throw new Error("El proveedor limitó temporalmente las búsquedas.");
      throw new Error("El proveedor de búsqueda no respondió correctamente.");
    }
    const payload = await response.json() as { results?: unknown[] };
    return (Array.isArray(payload.results) ? payload.results : [])
      .map((result) => result && typeof result === "object" && !Array.isArray(result)
        ? this.normalizeResult(result as Record<string, unknown>)
        : null)
      .filter((result): result is NormalizedImageSearchResult => result !== null)
      .slice(0, limit);
  }
}

export function buildImageSearchQuery(item: ImageAssistantItem): string {
  return [item.brand, item.name, extractConcentration(item.name), item.content, "official product bottle"]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function authorityForDomain(domain: string): SafeImageSourceAuthority {
  return resolveAllowedDomainConfigs().find((entry) => entry.domain === domain)?.type ?? "APPROVED_RETAILER";
}

function resultToCandidate(item: ImageAssistantItem, result: NormalizedImageSearchResult): SafeImageCandidate | null {
  if (!/\b(product|bottle|frasco|perfume)\b/i.test(result.title)) return null;
  const normalizedTitle = normalizeMatchKey(result.title);
  const exact = (value: string) => Boolean(value && normalizedTitle.includes(normalizeMatchKey(value)));
  const candidate: SafeImageCandidate = {
    sourceUrl: result.imageUrl,
    sourcePageUrl: result.sourcePageUrl,
    sourceDomain: result.sourceDomain,
    authority: authorityForDomain(result.sourceDomain),
    brand: exact(item.brand) ? item.brand : result.title,
    name: exact(item.name) ? item.name : result.title,
    concentration: exact(extractConcentration(item.name)) ? extractConcentration(item.name) : "",
    content: exact(item.content) ? item.content : "",
    imageRole: "PRODUCT"
  };
  return { ...candidate, token: signSafeImageCandidate(candidate) };
}

export async function searchSafeImageCandidates(
  item: ImageAssistantItem,
  provider: ImageSearchProvider = new BraveImageSearchProvider()
): Promise<SafeImageCandidate[]> {
  if (!isSafeImageSearchConfigured()) return [];
  const allowedDomains = [...getSafeImageAllowedDomains()];
  const byUrl = new Map<string, SafeImageCandidate>();
  for (const approvedDomain of allowedDomains) {
    const results = await provider.searchImages(buildImageSearchQuery(item), {
      approvedDomain,
      limit: DEFAULT_RESULT_LIMIT
    });
    for (const result of results) {
      let imageDomain = "";
      try { imageDomain = new URL(result.imageUrl).hostname.toLowerCase().replace(/\.$/, ""); } catch { continue; }
      if (!getSafeImageAllowedDomains().has(result.sourceDomain) || !getSafeImageAllowedDomains().has(imageDomain)) continue;
      const candidate = resultToCandidate(item, result);
      if (!candidate) continue;
      byUrl.set(candidate.sourceUrl, candidate);
      if (byUrl.size >= DEFAULT_RESULT_LIMIT) return [...byUrl.values()];
    }
  }
  return [...byUrl.values()];
}
