import { describe, expect, it } from "vitest";
import { ProductImageFrame } from "@/components/shared/ProductImageFrame";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * ProductImageFrame no usa hooks (sin useState/useEffect): se puede
 * invocar directamente como funcion pura y revisar el arbol de elementos
 * devuelto (mismo patron ya usado en este repo para componentes de
 * servidor, sin depender de una libreria de render).
 */

function frameElement(visualScale?: number) {
  return ProductImageFrame({ src: "https://cdn.example.com/foto.webp", alt: "Perfume de prueba", sizes: "50vw", visualScale });
}

describe("ProductImageFrame: visualScale (zoom uniforme sin deformar)", () => {
  it("sin visualScale (default): la capa de la foto no lleva ningun transform inline", () => {
    const element = frameElement();
    const paddingLayer = element.props.children[0];
    const scaleLayer = paddingLayer.props.children;
    expect(scaleLayer.props.style).toBeUndefined();
  });

  it("visualScale=1 explicito: tampoco aplica transform (equivalente al default)", () => {
    const element = frameElement(1);
    const paddingLayer = element.props.children[0];
    const scaleLayer = paddingLayer.props.children;
    expect(scaleLayer.props.style).toBeUndefined();
  });

  it("visualScale=1.15: aplica transform: scale(1.15) SOLO en la capa de la foto, nunca stretch/skew", () => {
    const element = frameElement(1.15);
    const paddingLayer = element.props.children[0];
    const scaleLayer = paddingLayer.props.children;
    expect(scaleLayer.props.style).toEqual({ transform: "scale(1.15)" });
  });

  it("el marco exterior mantiene overflow-hidden (el zoom nunca se derrama fuera de la card)", () => {
    const element = frameElement(1.3);
    expect(element.props.className).toMatch(/overflow-hidden/);
  });

  it("object-fit sigue siendo contain (nunca cover/deformado) independientemente del zoom", () => {
    const element = frameElement(1.2);
    const paddingLayer = element.props.children[0];
    const scaleLayer = paddingLayer.props.children;
    const image = scaleLayer.props.children;
    expect(image.props.className).toContain("object-contain");
  });
});
