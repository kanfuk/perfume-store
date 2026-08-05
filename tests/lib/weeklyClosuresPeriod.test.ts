import { describe, expect, it } from "vitest";
import {
  getCurrentWeekPeriod,
  getPreviousWeekPeriod,
  getWeekPeriodBoundariesForMonday,
  isMondayDateInput
} from "@/lib/weekly-closures/period";

/**
 * Fase 7.6A: verifica que el periodo semanal sea un intervalo semiabierto
 * exacto [periodStart, periodEndExclusive) de 7 dias, en hora de Chile, sin
 * usar 23:59:59 como limite superior (ver docs/SMELLME_WEEKLY_CLOSURES_DESIGN.md).
 */

describe("isMondayDateInput", () => {
  it("reconoce un lunes real", () => {
    // 2026-08-03 es lunes.
    expect(isMondayDateInput("2026-08-03")).toBe(true);
  });

  it("rechaza cualquier otro dia de la semana", () => {
    expect(isMondayDateInput("2026-08-04")).toBe(false); // martes
    expect(isMondayDateInput("2026-08-09")).toBe(false); // domingo
  });
});

describe("getWeekPeriodBoundariesForMonday", () => {
  it("calcula un intervalo semiabierto de exactamente 7 dias", () => {
    const period = getWeekPeriodBoundariesForMonday("2026-08-03");
    const diffMs = period.periodEndExclusive.getTime() - period.periodStart.getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("periodEndExclusive es el lunes siguiente, nunca 23:59:59 del domingo", () => {
    const period = getWeekPeriodBoundariesForMonday("2026-08-03");
    // El limite exclusivo debe caer exactamente a medianoche (Chile), no en
    // el ultimo milisegundo del domingo.
    const nextMonday = getWeekPeriodBoundariesForMonday("2026-08-10");
    expect(period.periodEndExclusive.getTime()).toBe(nextMonday.periodStart.getTime());
  });

  it("mondayDateInput se conserva tal cual para mostrar en la UI", () => {
    const period = getWeekPeriodBoundariesForMonday("2026-08-03");
    expect(period.mondayDateInput).toBe("2026-08-03");
  });

  it("periodStart cae efectivamente el lunes en hora de Chile (offset -03:00 o -04:00 segun DST)", () => {
    const period = getWeekPeriodBoundariesForMonday("2026-08-03");
    const chileHour = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Santiago",
      hour: "2-digit",
      hour12: false
    }).format(period.periodStart);
    expect(chileHour).toBe("00");
  });
});

describe("getCurrentWeekPeriod / getPreviousWeekPeriod", () => {
  it("getPreviousWeekPeriod es exactamente 7 dias antes de getCurrentWeekPeriod", () => {
    const reference = new Date("2026-08-05T15:00:00.000Z");
    const current = getCurrentWeekPeriod(reference);
    const previous = getPreviousWeekPeriod(reference);
    expect(current.periodStart.getTime() - previous.periodStart.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(current.periodEndExclusive.getTime()).toBe(previous.periodEndExclusive.getTime() + 7 * 24 * 60 * 60 * 1000);
  });

  it("getCurrentWeekPeriod produce un lunes valido segun isMondayDateInput", () => {
    const reference = new Date("2026-08-05T15:00:00.000Z");
    const current = getCurrentWeekPeriod(reference);
    expect(isMondayDateInput(current.mondayDateInput)).toBe(true);
  });
});
