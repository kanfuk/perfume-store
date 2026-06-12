/**
 * Proyecto: Pauli Store
 * Modulo: Gestion de Productos
 * Descripcion: Servicio encargado de exponer productos activos para el formulario cliente.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Separacion de responsabilidades y validacion de estados.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Producto } from "@/domain/Producto";
import type { ProductRepository } from "@/repositories/productRepository";
import { getProductRepository } from "@/repositories/productRepository";

export class ProductoService {
  constructor(private readonly productRepository: ProductRepository) {}

  async obtenerProductosActivos() {
    const products = await this.productRepository.buscarProductosActivos();

    return products
      .map((product) => new Producto(product))
      .filter((product) => product.activo)
      .map((product) => ({
        id: product.id,
        nombre: product.nombre,
        descripcion: product.descripcion,
        precioVenta: product.precioVenta,
        tipoProducto: product.tipoProducto
      }));
  }
}

export function createProductoService() {
  return new ProductoService(getProductRepository());
}
