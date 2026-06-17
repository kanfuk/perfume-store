const CHILE_TIME_ZONE = "America/Santiago";

export function formatChileDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: CHILE_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatChileDateOnly(value: string) {
  const stableDate = parseDateOnlyForChile(value);

  return new Intl.DateTimeFormat("es-CL", {
    timeZone: CHILE_TIME_ZONE,
    dateStyle: "medium"
  }).format(stableDate);
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
