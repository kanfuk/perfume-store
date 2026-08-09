/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Cierres semanales (Fase 7.6A)
 * Descripcion: Limites exactos (timestamptz) de una semana calendario
 * lunes-domingo en hora de Chile, como intervalo semiabierto
 * [periodStart, periodEndExclusive). Reutiliza getChileCurrentWeekRange
 * (lib/date.ts) para encontrar el lunes de una semana dada; agrega la
 * conversion a instante UTC exacto que ese modulo no necesitaba (solo
 * trabajaba con fechas-calendario, nunca con timestamps precisos).
 */

import { getChileCurrentWeekRange, getChileTodayInputValue } from "@/lib/date";

const CHILE_TIME_ZONE = "America/Santiago";

export type WeekPeriod = {
  /** Lunes 00:00:00 America/Santiago, como instante UTC exacto. */
  periodStart: Date;
  /** Lunes SIGUIENTE 00:00:00 America/Santiago (limite exclusivo). */
  periodEndExclusive: Date;
  /** Fecha (YYYY-MM-DD) del lunes, para mostrar/seleccionar en la UI. */
  mondayDateInput: string;
};

/**
 * Convierte una fecha-hora "de pared" en una zona horaria dada al instante
 * UTC exacto que representa, usando el motor de zonas horarias de Intl
 * (sin librerias externas). Tecnica estandar: se parte de un instante
 * candidato (tratando la hora de pared como si fuera UTC), se pregunta que
 * hora de pared representa ese instante en la zona destino, y se corrige
 * por la diferencia -- el offset de la zona en ese instante exacto queda
 * resuelto automaticamente, incluyendo cambios de horario de verano.
 *
 * Limitacion conocida y aceptada: en el instante exacto de una transicion
 * de horario de verano que ocurra justo a medianoche, la hora "00:00:00"
 * podria ser ambigua o inexistente en la zona; este caso extremo no se
 * resuelve especialmente aqui (ver docs/SMELLME_WEEKLY_CLOSURES_DESIGN.md).
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const parts = formatter.formatToParts(guess);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const hourPart = get("hour");
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hourPart === 24 ? 0 : hourPart,
    get("minute"),
    get("second")
  );

  const offsetMs = asIfUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs);
}

function parseDateInputParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new Error("Fecha invalida.");
  }

  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function addDaysToDateInput(value: string, days: number): string {
  const { year, month, day } = parseDateInputParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Limites exactos de la semana calendario (lunes-domingo, hora de Chile)
 * cuyo lunes es `mondayDateInput` (YYYY-MM-DD). No valida que el valor
 * recibido sea realmente un lunes -- eso es responsabilidad del llamador
 * (ver validatePeriod en cierreSemanalService.ts).
 */
export function getWeekPeriodBoundariesForMonday(mondayDateInput: string): WeekPeriod {
  const { year, month, day } = parseDateInputParts(mondayDateInput);
  const periodStart = zonedTimeToUtc(year, month, day, 0, 0, 0, CHILE_TIME_ZONE);

  const nextMondayInput = addDaysToDateInput(mondayDateInput, 7);
  const nextMonday = parseDateInputParts(nextMondayInput);
  const periodEndExclusive = zonedTimeToUtc(
    nextMonday.year,
    nextMonday.month,
    nextMonday.day,
    0,
    0,
    0,
    CHILE_TIME_ZONE
  );

  return { periodStart, periodEndExclusive, mondayDateInput };
}

/** Verdadero si `value` (YYYY-MM-DD) cae en lunes, en hora de Chile. */
export function isMondayDateInput(value: string): boolean {
  const { year, month, day } = parseDateInputParts(value);
  // Mismo truco de mediodia usado en lib/date.ts: evita corrimientos de dia
  // al construir el Date a partir de un string de fecha pura.
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return date.getDay() === 1;
}

/** Semana calendario que contiene `reference`, en hora de Chile. */
export function getCurrentWeekPeriod(reference = new Date()): WeekPeriod {
  const { from } = getChileCurrentWeekRange(reference);
  return getWeekPeriodBoundariesForMonday(from);
}

/**
 * Semana anterior a la que contiene `reference` -- sugerida por defecto en
 * la UI, porque la semana actual todavia no termina (cerrarla temprano
 * dejaria pedidos futuros de esa semana fuera del snapshot).
 */
export function getPreviousWeekPeriod(reference = new Date()): WeekPeriod {
  const current = getCurrentWeekPeriod(reference);
  const previousMonday = addDaysToDateInput(current.mondayDateInput, -7);
  return getWeekPeriodBoundariesForMonday(previousMonday);
}

/** Fecha de hoy (YYYY-MM-DD) en hora de Chile -- reexportado por conveniencia. */
export function getTodayDateInput(reference = new Date()): string {
  return getChileTodayInputValue(reference);
}
