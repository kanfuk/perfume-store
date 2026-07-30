/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Validacion de image_url
 * Descripcion: Valida que una URL de imagen asignada manualmente sea una URL
 * https:// o una ruta local dentro de /images/ -- nunca datos arbitrarios,
 * scripts ni protocolos distintos. No descarga ni verifica que el recurso
 * exista; solo valida la forma del valor antes de guardarlo.
 */

export type ImageUrlValidationResult = { value: string; error: null } | { value: null; error: string };

export function validateImageUrlInput(raw: unknown): ImageUrlValidationResult {
  if (typeof raw !== "string") {
    return { value: null, error: "La imagen debe ser un texto." };
  }

  const value = raw.trim();

  if (!value) {
    return { value: null, error: "La URL de la imagen no puede estar vacía." };
  }

  if (value.startsWith("/images/")) {
    return { value, error: null };
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:") {
      return { value, error: null };
    }
  } catch {
    // no es una URL absoluta valida, cae al error generico de abajo
  }

  return {
    value: null,
    error: "La imagen debe ser una URL https:// o una ruta local que empiece con /images/."
  };
}
