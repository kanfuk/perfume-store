function extractDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeChilePhone(value: string) {
  const digits = extractDigits(value.trim());

  if (!digits) {
    return null;
  }

  if (/^9\d{8}$/.test(digits)) {
    return `56${digits}`;
  }

  if (/^09\d{8}$/.test(digits)) {
    return `56${digits.slice(1)}`;
  }

  if (/^56\d{9}$/.test(digits) && digits[2] === "9") {
    return digits;
  }

  return null;
}
