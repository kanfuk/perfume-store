/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Maquina de estados de carga de ProductImage -- reintentos acotados.
 * Descripcion: Una URL de imagen recien subida puede fallar de forma
 * TRANSITORIA (blip de red puntual). Por eso un solo onError nunca decide el
 * fallback definitivo: se permiten hasta MAX_IMAGE_LOAD_RETRIES reintentos
 * acotados, contra la MISMA url (cada imagen ya tiene un UUID unico en su
 * ruta -- ver lib/product-image-config.ts -- por lo que el cache-busting con
 * query params no es necesario ni se usa), antes de rendirse. Este archivo
 * es logica pura (sin DOM, sin timers) para que la maquina de estados se
 * pueda probar con tests reales, no solo por inspeccion de codigo --
 * components/ProductImage.tsx solo la invoca.
 */

export const MAX_IMAGE_LOAD_RETRIES = 2;

/** Espera breve y acotada entre reintentos (propagacion de CDN/Storage), nunca usada para ocultar un fallo real. */
export const IMAGE_LOAD_RETRY_DELAY_MS = 500;

export type ImageLoadState = {
  /** 0 = intento inicial, 1 = reintento 1, 2 = reintento 2. Nunca supera MAX_IMAGE_LOAD_RETRIES. */
  attempt: number;
  /** true solo cuando se agotaron todos los intentos: unica condicion que activa el fallback definitivo. */
  failed: boolean;
};

export const INITIAL_IMAGE_LOAD_STATE: ImageLoadState = { attempt: 0, failed: false };

export type ImageLoadAction = { type: "error" } | { type: "success" };

/**
 * Reductor puro: "error" en el ultimo intento permitido marca `failed`
 * (fallback definitivo); en cualquier intento anterior solo avanza el
 * contador (el componente es quien decide esperar antes de despachar la
 * accion, para darle tiempo a la propagacion). "success" siempre limpia
 * `failed` -- una carga real posterior borra cualquier fallo previo.
 */
export function imageLoadReducer(state: ImageLoadState, action: ImageLoadAction): ImageLoadState {
  switch (action.type) {
    case "success":
      return state.failed ? { attempt: state.attempt, failed: false } : state;
    case "error":
      if (state.attempt >= MAX_IMAGE_LOAD_RETRIES) {
        return { attempt: state.attempt, failed: true };
      }
      return { attempt: state.attempt + 1, failed: false };
    default:
      return state;
  }
}
