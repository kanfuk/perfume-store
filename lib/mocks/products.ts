import type { ProductoProps } from "@/domain/Producto";

export const mockProducts: ProductoProps[] = [
  {
    id: "dobladita-solo-queso",
    nombre: "Dobladita solo queso",
    descripcion: "Dobladita casera recien horneada, rellena solo con queso.",
    precioVenta: 1000,
    imageUrl: "/images/products/dobladita-solo-queso.jpeg",
    badgeLabel: "DOBLADITA QUESO",
    costoUnitario: 580,
    stockActual: 18,
    stockAgenda: 18,
    activo: true,
    tipoProducto: "dobladita"
  },
  {
    id: "dobladita-jamon-pavo-queso",
    nombre: "Dobladita jamon de pavo acaramelado/queso",
    descripcion: "Dobladita casera con jamon de pavo acaramelado y queso.",
    precioVenta: 1300,
    imageUrl: "/images/products/dobladita-jamon-pavo-queso.jpeg",
    badgeLabel: "JAMON PAVO / QUESO",
    costoUnitario: 760,
    stockActual: 14,
    stockAgenda: 14,
    activo: true,
    tipoProducto: "dobladita premium"
  },
  {
    id: "dobladita-huevo",
    nombre: "Dobladita huevo",
    descripcion: "Dobladita casera rellena con huevo, ideal para desayuno.",
    precioVenta: 1500,
    imageUrl: "/images/products/dobladita-huevo.jpeg",
    badgeLabel: "DOBLADITA HUEVO",
    costoUnitario: 840,
    stockActual: 10,
    stockAgenda: 10,
    activo: true,
    tipoProducto: "desayuno"
  },
  {
    id: "dobladita-ave-mayo",
    nombre: "Dobladita ave mayo",
    descripcion: "Dobladita casera con ave mayo cremosa, perfecta para media manana.",
    precioVenta: 1500,
    imageUrl: "/images/products/dobladita-reserva-ave-mayo.png",
    badgeLabel: "AVE MAYO",
    costoUnitario: 880,
    stockActual: 12,
    stockAgenda: 12,
    activo: true,
    tipoProducto: "dobladita"
  },
  {
    id: "queque-casero-marmoleado",
    nombre: "Quequito marmoleado",
    descripcion: "Suave bizcocho humedo y esponjoso con sabor vainilla y chocolate.",
    precioVenta: 1000,
    imageUrl: "/images/products/queque-casero-marmoleado.png",
    badgeLabel: "QUEQUITO CASERO",
    costoUnitario: 450,
    stockActual: 8,
    stockAgenda: 8,
    activo: true,
    tipoProducto: "quequito"
  },
  {
    id: "queque-casero-banana",
    nombre: "Quequito banana bread",
    descripcion: "Rico bizcocho esponjoso, humedo, con platano y nueces.",
    precioVenta: 1000,
    imageUrl: "/images/products/queque-casero-banana.png",
    badgeLabel: "QUEQUITO CASERO",
    costoUnitario: 470,
    stockActual: 8,
    stockAgenda: 8,
    activo: true,
    tipoProducto: "quequito"
  },
  {
    id: "queque-casero-chocochips-sf",
    nombre: "Quequito choco chip sugar free",
    descripcion:
      "Bizcocho de vainilla endulzado con alulosa, con chips de chocolate semi amargo.",
    precioVenta: 1000,
    imageUrl: "/images/products/queque-casero-chocochips-sf.png",
    badgeLabel: "SUGAR FREE",
    costoUnitario: 520,
    stockActual: 8,
    stockAgenda: 8,
    activo: true,
    tipoProducto: "quequito"
  },
  {
    id: "carrot-cake-nueces",
    nombre: "Quequito carrot cake nueces",
    descripcion: "Bizcocho casero de zanahoria con nueces, suave y especiado.",
    precioVenta: 1000,
    imageUrl: "/images/products/carrot-cake-nueces.png",
    badgeLabel: "QUEQUITO CASERO",
    costoUnitario: 490,
    stockActual: 8,
    stockAgenda: 8,
    activo: true,
    tipoProducto: "quequito"
  }
];
