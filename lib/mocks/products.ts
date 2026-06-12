import type { ProductoProps } from "@/domain/Producto";

export const mockProducts: ProductoProps[] = [
  {
    id: "pan-amasado",
    nombre: "Pan amasado",
    descripcion: "Recien horneado, ideal para compartir.",
    precioVenta: 500,
    costoUnitario: 260,
    stockActual: 24,
    activo: true,
    tipoProducto: "pan"
  },
  {
    id: "queque-naranja",
    nombre: "Queque de naranja",
    descripcion: "Suave, casero y con glaseado liviano.",
    precioVenta: 4500,
    costoUnitario: 2400,
    stockActual: 8,
    activo: true,
    tipoProducto: "queque"
  },
  {
    id: "pack-once",
    nombre: "Pack de once",
    descripcion: "Seleccion de dulces y panes para reuniones pequenas.",
    precioVenta: 12000,
    costoUnitario: 7000,
    stockActual: 4,
    activo: true,
    tipoProducto: "pack"
  }
];
