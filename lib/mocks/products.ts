import type { ProductoProps } from "@/domain/Producto";

export const mockProducts: ProductoProps[] = [
  {
    id: "dobladita-solo-queso",
    nombre: "Dobladita solo queso",
    descripcion: "Dobladita casera recien horneada, rellena solo con queso.",
    precioVenta: 1000,
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
    costoUnitario: 840,
    stockActual: 10,
    stockAgenda: 10,
    activo: true,
    tipoProducto: "desayuno"
  }
];
