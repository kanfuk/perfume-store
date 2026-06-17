const CHILE_TIME_ZONE = "America/Santiago";
const SPANISH_SHORT_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic"
] as const;

export function formatChileDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(value));

  const year = getPart(parts, "year");
  const month = Number(getPart(parts, "month"));
  const day = getPart(parts, "day");
  const hour = getPart(parts, "hour");
  const minute = getPart(parts, "minute");

  return `${day} ${SPANISH_SHORT_MONTHS[month - 1]} ${year}, ${hour}:${minute}`;
}

export function formatChileDateOnly(value: string) {
  const stableDate = parseDateOnlyForChile(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(stableDate);

  const year = getPart(parts, "year");
  const month = Number(getPart(parts, "month"));
  const day = getPart(parts, "day");

  return `${day} ${SPANISH_SHORT_MONTHS[month - 1]} ${year}`;
}

export function getChileTodayInputValue(reference = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(reference);
}

function parseDateOnlyForChile(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return new Date(value);
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  // Midday UTC avoids day shifting between SSR and browser local parsing.
  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) {
  return parts.find((part) => part.type === type)?.value ?? "";
}
