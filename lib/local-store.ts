import { mockProducts } from "@/lib/mocks/products";

export type LocalCustomerRecord = {
  id: string;
  nombre: string;
  telefono: string;
  lugarTrabajo: string;
  createdAt: string;
};

export type LocalOrderRecord = {
  id: string;
  clienteId: string;
  estadoPedido: string;
  estadoPago: string;
  total: number;
  fechaPedido: string;
  fechaAgendado?: string;
  fechaCierre?: string;
  fechaCancelacion?: string;
  motivoCancelacion?: string;
};

export type LocalOrderItemRecord = {
  id: string;
  pedidoId: string;
  productoId: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
};

export const localStore = {
  customers: [] as LocalCustomerRecord[],
  orders: [] as LocalOrderRecord[],
  orderItems: [] as LocalOrderItemRecord[],
  products: [...mockProducts]
};
