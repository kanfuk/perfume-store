import { describe, expect, it } from "vitest";
import {
  INITIAL_IMAGE_LOAD_STATE,
  MAX_IMAGE_LOAD_RETRIES,
  imageLoadReducer
} from "@/lib/product-image-fallback.ts";

/**
 * Regresion: el fallback de ProductImage NO puede depender de un solo
 * onError. Una URL recien subida puede fallar de forma transitoria mientras
 * el CDN de Storage todavia propaga el archivo (o mientras un cache
 * intermedio recuerda el primer intento fallido). `imageLoadReducer` es la
 * maquina de estados pura que decide cuando reintentar y cuando rendirse
 * definitivamente -- se prueba aqui con datos reales, sin DOM.
 */
describe("imageLoadReducer: reintentos acotados antes del fallback definitivo", () => {
  it("estado inicial: intento 0, sin fallo", () => {
    expect(INITIAL_IMAGE_LOAD_STATE).toEqual({ attempt: 0, failed: false });
  });

  it("primer error (intento inicial) transitorio: avanza a reintento 1, no falla", () => {
    const next = imageLoadReducer(INITIAL_IMAGE_LOAD_STATE, { type: "error" });
    expect(next).toEqual({ attempt: 1, failed: false });
  });

  it("segundo error (reintento 1): avanza a reintento 2, no falla", () => {
    const afterFirst = imageLoadReducer(INITIAL_IMAGE_LOAD_STATE, { type: "error" });
    const afterSecond = imageLoadReducer(afterFirst, { type: "error" });
    expect(afterSecond).toEqual({ attempt: 2, failed: false });
  });

  it("tercer error (reintento 2, el ultimo permitido): recien ahi marca fallback definitivo", () => {
    let state = INITIAL_IMAGE_LOAD_STATE;
    state = imageLoadReducer(state, { type: "error" }); // intento inicial falla -> reintento 1
    state = imageLoadReducer(state, { type: "error" }); // reintento 1 falla -> reintento 2
    expect(state.failed).toBe(false);
    state = imageLoadReducer(state, { type: "error" }); // reintento 2 falla -> fallback definitivo
    expect(state).toEqual({ attempt: 2, failed: true });
  });

  it(`nunca reintenta mas de ${MAX_IMAGE_LOAD_RETRIES} veces (el intento no crece despues de fallar)`, () => {
    let state = INITIAL_IMAGE_LOAD_STATE;
    for (let i = 0; i < 10; i += 1) {
      state = imageLoadReducer(state, { type: "error" });
    }
    expect(state.attempt).toBe(MAX_IMAGE_LOAD_RETRIES);
    expect(state.failed).toBe(true);
  });

  it("un exito posterior a un fallback definitivo lo limpia (sin importar el intento en el que ocurra)", () => {
    let state = INITIAL_IMAGE_LOAD_STATE;
    state = imageLoadReducer(state, { type: "error" });
    state = imageLoadReducer(state, { type: "error" });
    state = imageLoadReducer(state, { type: "error" });
    expect(state.failed).toBe(true);

    const recovered = imageLoadReducer(state, { type: "success" });
    expect(recovered.failed).toBe(false);
  });

  it("un exito en el intento inicial (sin errores previos) mantiene el estado sin fallo", () => {
    const state = imageLoadReducer(INITIAL_IMAGE_LOAD_STATE, { type: "success" });
    expect(state).toEqual({ attempt: 0, failed: false });
  });

  it("exito despues de un unico reintento tambien limpia cualquier fallo", () => {
    const afterOneError = imageLoadReducer(INITIAL_IMAGE_LOAD_STATE, { type: "error" });
    const afterSuccess = imageLoadReducer(afterOneError, { type: "success" });
    expect(afterSuccess.failed).toBe(false);
    expect(afterSuccess.attempt).toBe(1);
  });
});
