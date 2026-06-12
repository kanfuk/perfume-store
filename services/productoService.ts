/**
 * Proyecto: Pauli Store
 * Modulo: Gestion de Productos
 * Descripcion: Servicio encargado de exponer productos activos para el formulario cliente.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Separacion de responsabilidades y validacion de estados.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Producto } from "@/domain/Producto";
import type { AdminProductRecord } from "@/lib/types";
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

  async obtenerCatalogoAdmin(): Promise<AdminProductRecord[]> {
    const products = await this.productRepository.buscarTodosProductos();

    return products.map((product) => {
      const domainProduct = new Producto(product);

      return {
        id: domainProduct.id,
        nombre: domainProduct.nombre,
        descripcion: domainProduct.descripcion,
        precioVenta: domainProduct.precioVenta,
        costoUnitario: domainProduct.costoUnitario,
        stockActual: domainProduct.stockActual,
        activo: domainProduct.activo,
        tipoProducto: domainProduct.tipoProducto,
        utilidadUnitaria: domainProduct.calcularUtilidadUnitaria()
      };
    });
  }

  async crearProductoAdmin(input: {
    nombre: string;
    descripcion?: string;
    precioVenta: number;
    costoUnitario?: number;
    stockActual?: number;
    activo?: boolean;
    tipoProducto?: string;
  }) {
    const product = new Producto({
      id: crypto.randomUUID(),
      nombre: input.nombre,
      descripcion: input.descripcion,
      precioVenta: input.precioVenta,
      costoUnitario: input.costoUnitario ?? 0,
      stockActual: input.stockActual ?? 0,
      activo: input.activo ?? true,
      tipoProducto: input.tipoProducto ?? "simple"
    });

    await this.productRepository.crearProducto({
      id: product.id,
      nombre: product.nombre,
      descripcion: product.descripcion,
      precioVenta: product.precioVenta,
      costoUnitario: product.costoUnitario,
      stockActual: product.stockActual,
      activo: product.activo,
      tipoProducto: product.tipoProducto
    });
  }

  async actualizarProductoAdmin(
    id: string,
    input: {
      nombre: string;
      descripcion?: string;
      precioVenta: number;
      costoUnitario?: number;
      stockActual?: number;
      activo?: boolean;
      tipoProducto?: string;
    }
  ) {
    const current = await this.productRepository.buscarProductoPorId(id);

    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const domainProduct = new Producto({
      ...current,
      nombre: input.nombre,
      descripcion: input.descripcion,
      precioVenta: input.precioVenta,
      costoUnitario: input.costoUnitario ?? 0,
      stockActual: input.stockActual ?? 0,
      activo: input.activo ?? true,
      tipoProducto: input.tipoProducto ?? "simple"
    });

    await this.productRepository.actualizarProducto(id, {
      nombre: domainProduct.nombre,
      descripcion: domainProduct.descripcion,
      precioVenta: domainProduct.precioVenta,
      costoUnitario: domainProduct.costoUnitario,
      stockActual: domainProduct.stockActual,
      activo: domainProduct.activo,
      tipoProducto: domainProduct.tipoProducto
    });
  }

  async cambiarEstadoProducto(id: string, activo: boolean) {
    const current = await this.productRepository.buscarProductoPorId(id);

    if (!current) {
      throw new Error("Producto no encontrado.");
    }

    const domainProduct = new Producto(current);
    if (activo) {
      domainProduct.activar();
    } else {
      domainProduct.desactivar();
    }

    await this.productRepository.actualizarProducto(id, { activo: domainProduct.activo });
  }
}

export function createProductoService() {
  return new ProductoService(getProductRepository());
}
