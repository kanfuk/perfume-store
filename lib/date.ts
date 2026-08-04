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

export function getTomorrowLocalDate(reference = new Date()) {
  const date = new Date(reference);
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getChileTomorrowInputValue(reference = new Date()) {
  const today = getChileTodayInputValue(reference);
  const date = parseDateInputAsLocalNoon(today);
  date.setDate(date.getDate() + 1);
  return formatDateInput(date);
}

export function getChileCurrentMonthRange(reference = new Date()) {
  const today = getChileTodayInputValue(reference);
  const date = parseDateInputAsLocalNoon(today);
  const year = date.getFullYear();
  const month = date.getMonth();

  return {
    from: formatDateInput(new Date(year, month, 1, 12, 0, 0)),
    to: formatDateInput(new Date(year, month + 1, 0, 12, 0, 0))
  };
}

/** Semana lunes a domingo que contiene `reference`, en horario de Chile. */
export function getChileCurrentWeekRange(reference = new Date()) {
  const today = getChileTodayInputValue(reference);
  const date = parseDateInputAsLocalNoon(today);
  const isoWeekday = date.getDay() === 0 ? 7 : date.getDay(); // lunes=1 ... domingo=7
  const monday = new Date(date);
  monday.setDate(date.getDate() - (isoWeekday - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    from: formatDateInput(monday),
    to: formatDateInput(sunday)
  };
}

export function parseDateInputAsLocalNoon(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return new Date(value);
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

export function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
