import { normalizeChilePhone } from "@/lib/phone/normalizeChilePhone";

export type ChileanMobilePhone = {
  national: string;
  e164: string;
  display: string;
};

function extractDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function parseChileanMobilePhone(value: string): ChileanMobilePhone | null {
  const normalizedPhone = normalizeChilePhone(value);

  if (!normalizedPhone) {
    return null;
  }

  const national = normalizedPhone.slice(2);

  return {
    national,
    e164: `+56${national}`,
    display: `+56 ${national[0]} ${national.slice(1, 5)} ${national.slice(5)}`
  };
}

export function isValidChileanMobilePhone(value: string) {
  return parseChileanMobilePhone(value) !== null;
}

export function formatChileanMobileInput(value: string) {
  const digits = extractDigits(value);
  let national = digits;

  if (digits.startsWith("56")) {
    national = digits.slice(2);
  } else if (digits.startsWith("0")) {
    national = digits.slice(1);
  }

  national = national.slice(0, 9);

  if (national.length <= 1) {
    return national;
  }

  if (national.length <= 5) {
    return `${national[0]} ${national.slice(1)}`.trim();
  }

  return `${national[0]} ${national.slice(1, 5)} ${national.slice(5)}`.trim();
}
