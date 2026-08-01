import type { ImageAssistantItem, SafeImageCandidate, SafeImageSourceAuthority } from "./types";
import crypto from "node:crypto";

const AUTHORITIES = new Set<SafeImageSourceAuthority>([
  "MANUFACTURER",
  "OFFICIAL_BRAND",
  "AUTHORIZED_DISTRIBUTOR",
  "APPROVED_RETAILER"
]);

export function getSafeImageAllowedDomains(): ReadonlySet<string> {
  return new Set(
    (process.env.SAFE_IMAGE_ALLOWED_DOMAINS ?? "")
      .split(",")
      .map((domain) => domain.trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean)
  );
}

export function isSafeImageSearchConfigured(): boolean {
  return Boolean(
    process.env.SAFE_IMAGE_SEARCH_ENDPOINT?.trim() &&
      process.env.SAFE_IMAGE_SEARCH_API_KEY?.trim() &&
      process.env.SAFE_IMAGE_CANDIDATE_SIGNING_SECRET?.trim() &&
      getSafeImageAllowedDomains().size > 0
  );
}

function candidateSignaturePayload(candidate: SafeImageCandidate): string {
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
  const secret = process.env.SAFE_IMAGE_CANDIDATE_SIGNING_SECRET?.trim();
  if (!secret) throw new Error("La firma de candidatos seguros no está configurada.");
  return crypto.createHmac("sha256", secret).update(candidateSignaturePayload(candidate)).digest("base64url");
}

export function verifySafeImageCandidate(candidate: SafeImageCandidate): boolean {
  if (!candidate.token) return false;
  const expected = signSafeImageCandidate(candidate);
  const received = Buffer.from(candidate.token);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
}

function sanitizeCandidate(value: unknown, allowedDomains: ReadonlySet<string>): SafeImageCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const string = (key: string) => (typeof raw[key] === "string" ? raw[key].trim() : "");
  const sourceUrl = string("sourceUrl");
  let parsed: URL;
  try { parsed = new URL(sourceUrl); } catch { return null; }
  const sourceDomain = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const authority = string("authority") as SafeImageSourceAuthority;
  if (
    parsed.protocol !== "https:" ||
    !allowedDomains.has(sourceDomain) ||
    !AUTHORITIES.has(authority) ||
    string("imageRole") !== "PRODUCT"
  ) return null;
  return {
    sourceUrl: parsed.toString(),
    sourcePageUrl: string("sourcePageUrl") || undefined,
    sourceDomain,
    authority,
    brand: string("brand"),
    name: string("name"),
    concentration: string("concentration"),
    content: string("content"),
    imageRole: "PRODUCT"
  };
}

export async function searchSafeImageCandidates(item: ImageAssistantItem): Promise<SafeImageCandidate[]> {
  if (!isSafeImageSearchConfigured()) return [];
  const endpoint = process.env.SAFE_IMAGE_SEARCH_ENDPOINT!.trim();
  const allowedDomains = getSafeImageAllowedDomains();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SAFE_IMAGE_SEARCH_API_KEY!.trim()}`
    },
    body: JSON.stringify({
      brand: item.brand,
      name: item.name,
      content: item.content,
      concentration: item.name
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error("El proveedor de búsqueda segura no respondió correctamente.");
  const payload = (await response.json()) as { candidates?: unknown[] };
  return (Array.isArray(payload.candidates) ? payload.candidates : [])
    .map((candidate) => sanitizeCandidate(candidate, allowedDomains))
    .filter((candidate): candidate is SafeImageCandidate => candidate !== null)
    .map((candidate) => ({ ...candidate, token: signSafeImageCandidate(candidate) }))
    .slice(0, 5);
}
