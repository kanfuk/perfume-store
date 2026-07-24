export type ChileanRut = {
  digits: string;
  verifier: string;
  normalized: string;
  display: string;
};

function extractRutChars(value: string) {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

function computeVerifier(digits: string) {
  let sum = 0;
  let multiplier = 2;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    sum += Number(digits[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);

  if (remainder === 11) {
    return "0";
  }

  if (remainder === 10) {
    return "K";
  }

  return String(remainder);
}

export function parseChileanRut(value: string): ChileanRut | null {
  const raw = extractRutChars(value.trim());

  if (raw.length < 2) {
    return null;
  }

  const digits = raw.slice(0, -1);
  const verifier = raw.slice(-1);

  if (!/^\d{7,8}$/.test(digits)) {
    return null;
  }

  if (computeVerifier(digits) !== verifier) {
    return null;
  }

  const displayDigits = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return {
    digits,
    verifier,
    normalized: `${digits}-${verifier}`,
    display: `${displayDigits}-${verifier}`
  };
}

export function isValidChileanRut(value: string) {
  return parseChileanRut(value) !== null;
}
