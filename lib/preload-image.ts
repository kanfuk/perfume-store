/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Precarga real de imagen en el navegador (verificacion post-subida).
 * Descripcion: Despues de subir/reemplazar una imagen, el admin NO debe ver
 * "Imagen guardada" solo porque el POST/PATCH del backend no lanzo una
 * excepcion -- eso ya se demostro insuficiente (el backend puede confirmar
 * persistencia en DB/Storage mientras el navegador todavia no puede cargar
 * la URL, por CDN/propagacion o cache del optimizador de imagenes). Esta
 * funcion hace lo mismo que haria un <img>/next/image real: crea una imagen,
 * le asigna `src`, y espera su evento `onload`/`onerror` real.
 *
 * `createImage` es inyectable a proposito: permite probar la maquina de
 * estados (onload / onerror / timeout / limpieza) con un objeto falso, sin
 * necesitar jsdom (que este proyecto no tiene instalado). En produccion
 * siempre es `() => new window.Image()`.
 */

export type PreloadableImage = {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
};

export type PreloadImageOptions = {
  /** Tiempo maximo de espera antes de tratar la precarga como fallida. Nunca oculta un fallo real: solo evita esperar para siempre. */
  timeoutMs?: number;
  createImage?: () => PreloadableImage;
};

export const DEFAULT_PRELOAD_TIMEOUT_MS = 8000;

export function preloadImage(url: string, options: PreloadImageOptions = {}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PRELOAD_TIMEOUT_MS;
  const createImage = options.createImage ?? (() => new window.Image() as unknown as PreloadableImage);

  return new Promise((resolve) => {
    let settled = false;
    const img = createImage();

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(false);
    }, timeoutMs);

    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}
