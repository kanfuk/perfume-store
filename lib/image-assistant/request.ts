const MAX_CSV_BASE64_LENGTH = 3 * 1024 * 1024;

export function decodeImageAssistantCsv(body: Record<string, unknown>): Buffer {
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : "";
  if (!fileName.toLowerCase().endsWith(".csv") || !fileBase64) {
    throw new Error("Selecciona el CSV de proveedor.");
  }
  if (fileBase64.length > MAX_CSV_BASE64_LENGTH) {
    throw new Error("El CSV supera el tamaño permitido.");
  }
  const buffer = Buffer.from(fileBase64, "base64");
  if (buffer.length === 0) throw new Error("El CSV está vacío.");
  return buffer;
}

export function hasOnlyFields(body: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(body).every((key) => allowed.has(key));
}
