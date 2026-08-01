import crypto from "node:crypto";
import dns from "node:dns/promises";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import net from "node:net";
import sharp from "sharp";
import { PRODUCT_IMAGE_CONFIG, isAcceptedProductImageMimeType } from "@/lib/product-image-config";

const MAX_REDIRECTS = 3;
export const MIN_SOURCE_IMAGE_DIMENSION = 300;
export const MAX_SOURCE_IMAGE_DIMENSION = 10_000;

export class SafeImageDownloadError extends Error {
  constructor(
    readonly code:
      | "UNSAFE_URL"
      | "UNSAFE_DNS"
      | "UNSAFE_REDIRECT"
      | "INVALID_MIME"
      | "INVALID_MAGIC_BYTES"
      | "TOO_LARGE"
      | "INVALID_DIMENSIONS"
      | "DOWNLOAD_FAILED",
    message: string
  ) {
    super(message);
    this.name = "SafeImageDownloadError";
  }
}

export type DnsAddress = { address: string; family: number };
export type DnsResolver = (hostname: string) => Promise<DnsAddress[]>;

function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
}

function ipv4InCidr(address: string, network: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(network) & mask);
}

export function isPublicIpAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.88.99.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4]
    ];
    return !blocked.some(([network, prefix]) => ipv4InCidr(address, network, prefix));
  }
  if (family === 6) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") return false;
    if (value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8")) return false;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPublicIpAddress(mapped) : true;
  }
  return false;
}

export function parseAndValidateSourceUrl(rawUrl: string, allowedDomains: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeImageDownloadError("UNSAFE_URL", "La URL de origen no es válida.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const privateQueryKeys = new Set(["token", "signature", "sig", "key", "api_key", "x-amz-signature", "x-goog-signature"]);
  if (
    url.protocol !== "https:" ||
    (url.port !== "" && url.port !== "443") ||
    url.username !== "" ||
    url.password !== "" ||
    hostname === "localhost" ||
    net.isIP(hostname) !== 0 ||
    [...url.searchParams.keys()].some((key) => privateQueryKeys.has(key.toLowerCase())) ||
    !allowedDomains.has(hostname)
  ) {
    throw new SafeImageDownloadError("UNSAFE_URL", "La URL no pertenece a una fuente HTTPS aprobada.");
  }
  url.hash = "";
  return url;
}

export async function resolveSafeSourceUrl(
  rawUrl: string,
  allowedDomains: ReadonlySet<string>,
  resolver: DnsResolver = async (hostname) => dns.lookup(hostname, { all: true, verbatim: true })
): Promise<{ url: URL; addresses: DnsAddress[] }> {
  const url = parseAndValidateSourceUrl(rawUrl, allowedDomains);
  let addresses: DnsAddress[];
  try {
    addresses = await resolver(url.hostname);
  } catch {
    throw new SafeImageDownloadError("UNSAFE_DNS", "No fue posible validar el dominio de origen.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new SafeImageDownloadError("UNSAFE_DNS", "El dominio de origen resuelve a una red no permitida.");
  }
  return { url, addresses };
}

export function detectImageMimeFromMagicBytes(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";
  return null;
}

export function validateImageEnvelope(
  buffer: Buffer,
  declaredMimeRaw: string,
  declaredLength = buffer.length
): string {
  if (declaredLength > PRODUCT_IMAGE_CONFIG.maxInputBytes || buffer.length > PRODUCT_IMAGE_CONFIG.maxInputBytes) {
    throw new SafeImageDownloadError("TOO_LARGE", "La imagen supera 10 MiB.");
  }
  const declaredMime = declaredMimeRaw.split(";")[0].trim().toLowerCase();
  if (!isAcceptedProductImageMimeType(declaredMime)) {
    throw new SafeImageDownloadError("INVALID_MIME", "La fuente declaró un tipo de archivo no permitido.");
  }
  const detectedMime = detectImageMimeFromMagicBytes(buffer);
  if (!detectedMime || detectedMime !== declaredMime) {
    throw new SafeImageDownloadError("INVALID_MAGIC_BYTES", "El contenido real no coincide con una imagen permitida.");
  }
  return detectedMime;
}

export function resolveRedirectLocation(currentUrl: URL, location: string, allowedDomains: ReadonlySet<string>): URL {
  let next: URL;
  try { next = new URL(location, currentUrl); } catch {
    throw new SafeImageDownloadError("UNSAFE_REDIRECT", "La redirección de la imagen no es segura.");
  }
  try { return parseAndValidateSourceUrl(next.toString(), allowedDomains); } catch {
    throw new SafeImageDownloadError("UNSAFE_REDIRECT", "La redirección salió de las fuentes aprobadas.");
  }
}

type RawDownload = { status: number; headers: IncomingHttpHeaders; buffer: Buffer };

function requestPinned(url: URL, address: DnsAddress): Promise<RawDownload> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: "https:",
        hostname: address.address,
        family: address.family,
        port: 443,
        servername: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          Host: url.host,
          Accept: "image/jpeg,image/png,image/webp",
          "User-Agent": "SmellmeSafeImageAssistant/1.0"
        },
        timeout: 12_000,
        rejectUnauthorized: true
      },
      (response) => {
        const declared = Number(response.headers["content-length"] ?? 0);
        if (declared > PRODUCT_IMAGE_CONFIG.maxInputBytes) {
          response.destroy();
          reject(new SafeImageDownloadError("TOO_LARGE", "La imagen supera 10 MiB."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > PRODUCT_IMAGE_CONFIG.maxInputBytes) {
            response.destroy(new SafeImageDownloadError("TOO_LARGE", "La imagen supera 10 MiB."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          buffer: Buffer.concat(chunks)
        }));
        response.on("error", reject);
      }
    );
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", reject);
    request.end();
  });
}

export type SafeDownloadedImage = {
  buffer: Buffer;
  finalUrl: string;
  sourceDomain: string;
  contentType: string;
  sha256: string;
  width: number;
  height: number;
};

export async function downloadSafeImage(
  sourceUrl: string,
  allowedDomains: ReadonlySet<string>,
  resolver?: DnsResolver
): Promise<SafeDownloadedImage> {
  let current = sourceUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const resolved = await resolveSafeSourceUrl(current, allowedDomains, resolver);
    let response: RawDownload;
    try {
      response = await requestPinned(resolved.url, resolved.addresses[0]);
    } catch (error) {
      if (error instanceof SafeImageDownloadError) throw error;
      throw new SafeImageDownloadError("DOWNLOAD_FAILED", "No fue posible descargar la imagen segura.");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location || redirect === MAX_REDIRECTS) {
        throw new SafeImageDownloadError("UNSAFE_REDIRECT", "La redirección de la imagen no es segura.");
      }
      current = resolveRedirectLocation(resolved.url, location, allowedDomains).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new SafeImageDownloadError("DOWNLOAD_FAILED", "La fuente no entregó una imagen válida.");
    }
    const detectedMime = validateImageEnvelope(
      response.buffer,
      String(response.headers["content-type"] ?? ""),
      Number(response.headers["content-length"] ?? response.buffer.length)
    );
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(response.buffer, { failOn: "error" }).metadata();
    } catch {
      throw new SafeImageDownloadError("INVALID_MAGIC_BYTES", "La imagen no pudo decodificarse.");
    }
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (
      Math.min(width, height) < MIN_SOURCE_IMAGE_DIMENSION ||
      Math.max(width, height) > MAX_SOURCE_IMAGE_DIMENSION
    ) {
      throw new SafeImageDownloadError("INVALID_DIMENSIONS", "Las dimensiones de la imagen no son seguras.");
    }
    return {
      buffer: response.buffer,
      finalUrl: resolved.url.toString(),
      sourceDomain: resolved.url.hostname,
      contentType: detectedMime,
      sha256: crypto.createHash("sha256").update(response.buffer).digest("hex"),
      width,
      height
    };
  }
  throw new SafeImageDownloadError("UNSAFE_REDIRECT", "La redirección de la imagen no es segura.");
}
