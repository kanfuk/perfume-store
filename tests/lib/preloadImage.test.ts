import { describe, expect, it, vi } from "vitest";
import { preloadImage, type PreloadableImage } from "@/lib/preload-image.ts";

/**
 * Regresion: el admin NO debe ver "Imagen guardada" solo porque el POST del
 * backend no lanzo una excepcion -- eso ya se demostro insuficiente (Storage
 * y DB pueden confirmar persistencia mientras el navegador todavia no puede
 * cargar la URL). `preloadImage` replica lo que haria un <img> real: crea
 * una imagen, le asigna `src`, y espera su evento onload/onerror real.
 * `createImage` es inyectable para probar la maquina de estados sin jsdom
 * (que este proyecto no tiene instalado).
 */
function fakeImage(): PreloadableImage & { triggerLoad: () => void; triggerError: () => void } {
  const img: PreloadableImage & { triggerLoad: () => void; triggerError: () => void } = {
    onload: null,
    onerror: null,
    src: "",
    triggerLoad() {
      img.onload?.();
    },
    triggerError() {
      img.onerror?.();
    }
  };
  return img;
}

describe("preloadImage", () => {
  it("resuelve true cuando la imagen dispara onload", async () => {
    let created: ReturnType<typeof fakeImage> | null = null;
    const promise = preloadImage("https://cdn.example/a.webp", {
      createImage: () => {
        created = fakeImage();
        return created;
      }
    });

    expect(created).not.toBeNull();
    created!.triggerLoad();

    await expect(promise).resolves.toBe(true);
  });

  it("resuelve false cuando la imagen dispara onerror", async () => {
    let created: ReturnType<typeof fakeImage> | null = null;
    const promise = preloadImage("https://cdn.example/a.webp", {
      createImage: () => {
        created = fakeImage();
        return created;
      }
    });

    created!.triggerError();

    await expect(promise).resolves.toBe(false);
  });

  it("asigna la URL exacta a src", () => {
    let created: ReturnType<typeof fakeImage> | null = null;
    void preloadImage("https://cdn.example/producto.webp", {
      createImage: () => {
        created = fakeImage();
        return created;
      }
    });
    expect(created!.src).toBe("https://cdn.example/producto.webp");
  });

  it("resuelve false por timeout si nunca dispara onload ni onerror (no espera para siempre)", async () => {
    vi.useFakeTimers();
    try {
      const promise = preloadImage("https://cdn.example/a.webp", {
        timeoutMs: 1000,
        createImage: fakeImage
      });

      vi.advanceTimersByTime(1000);
      await expect(promise).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignora un onload tardio que llega DESPUES del timeout (ya resolvio false)", async () => {
    vi.useFakeTimers();
    try {
      let created: ReturnType<typeof fakeImage> | null = null;
      const promise = preloadImage("https://cdn.example/a.webp", {
        timeoutMs: 1000,
        createImage: () => {
          created = fakeImage();
          return created;
        }
      });

      vi.advanceTimersByTime(1000);
      const result = await promise;
      created!.triggerLoad(); // tardio: no deberia cambiar nada, la promesa ya resolvio
      expect(result).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignora un segundo evento despues de que ya resolvio (onload seguido de onerror)", async () => {
    let created: ReturnType<typeof fakeImage> | null = null;
    const promise = preloadImage("https://cdn.example/a.webp", {
      createImage: () => {
        created = fakeImage();
        return created;
      }
    });

    created!.triggerLoad();
    created!.triggerError(); // no deberia hacer nada, la promesa ya resolvio true

    await expect(promise).resolves.toBe(true);
  });
});
