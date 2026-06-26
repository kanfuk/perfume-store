export function normalizeCustomerLookupValue(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeCustomerDisplayName(value: string) {
  const normalized = normalizeCustomerLookupValue(value);

  if (normalized === "paty" || normalized === "patricia diaz") {
    return "Patricia Diaz";
  }

  if (normalized === "loreto looez" || normalized === "loreto lopez") {
    return "Loreto Lopez";
  }

  if (
    normalized === "yo" ||
    normalized === "cliente ocasional" ||
    normalized === "pauli"
  ) {
    return "Pauli";
  }

  if (normalized === "camila montes") {
    return "Camila Montes";
  }

  return value.trim();
}

export function isWeakCustomerWorkplaceName(value: string) {
  const normalized = normalizeCustomerLookupValue(value);

  return (
    normalized === "" ||
    normalized === "venta directa" ||
    normalized === "venta whatsapp manual" ||
    normalized === "pedido personalizado"
  );
}

