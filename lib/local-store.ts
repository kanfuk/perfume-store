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
  fechaEntrega?: string;
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

export type LocalPaymentRecord = {
  id: string;
  pedidoId: string;
  monto: number;
  metodoPago?: string;
  estadoPago: string;
  fechaPago: string;
};

export type LocalFiadoRecord = {
  id: string;
  pedidoId: string;
  clienteId: string;
  montoPendiente: number;
  estado: string;
  fechaFiado: string;
  fechaPagoFiado?: string;
};

export const localStore = {
  customers: [] as LocalCustomerRecord[],
  orders: [] as LocalOrderRecord[],
  orderItems: [] as LocalOrderItemRecord[],
  payments: [] as LocalPaymentRecord[],
  fiados: [] as LocalFiadoRecord[],
  products: [...mockProducts]
};
