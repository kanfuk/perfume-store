const CHILE_TIME_ZONE = "America/Santiago";

export function formatChileDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: CHILE_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatChileDateOnly(value: string) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: CHILE_TIME_ZONE,
    dateStyle: "medium"
  }).format(new Date(`${value}T00:00:00`));
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
