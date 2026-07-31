import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import {
  resolveAccountTypeDisplayName,
  resolveBankDisplayName,
  type BusinessPaymentSettings
} from "@/lib/businessPaymentSettings";
import type { MetodoDespacho } from "@/lib/constants";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { httpStatusForPerfumeOrderError } from "@/lib/perfumeOrderErrors";
import type { AdminOrderSummary, AdminOrdersAction } from "@/lib/types";
import { buildOrderPaymentConfirmedMessage } from "@/lib/whatsapp/buildOrderPaymentConfirmedMessage";
import { buildOrderPaymentRequestMessage } from "@/lib/whatsapp/buildOrderPaymentRequestMessage";
import { createBusinessSettingsService } from "@/services/businessSettingsService";
import { createPedidoService } from "@/services/pedidoService";

/** Estados donde "Coordinar entrega por WhatsApp" sigue teniendo sentido. */
const ESTADOS_CON_ENTREGA_COORDINABLE = new Set(["PAGADO", "PREPARANDO", "DESPACHADO"]);
const ORDER_ACTION_FIELDS = new Set([
  "action",
  "motivoCancelacion",
  "confirmarPagoPerdido",
  "monto",
  "metodoPago"
]);

function buildPaymentRequestMessageForOrder(
  pedido: AdminOrderSummary,
  settings: BusinessPaymentSettings
) {
  return buildOrderPaymentRequestMessage({
    customerName: pedido.clienteNombre,
    codigo: pedido.codigo,
    items: pedido.items.map((item) => ({
      name: item.productoNombre,
      quantity: item.cantidad
    })),
    subtotal: pedido.total - (pedido.costoDespacho ?? 0),
    costoDespacho: pedido.costoDespacho,
    total: pedido.total,
    bankData: {
      accountHolder: settings.titularCuenta,
      rut: settings.rutTitular,
      bank: resolveBankDisplayName(settings.banco),
      accountType: resolveAccountTypeDisplayName(settings.tipoCuenta),
      accountNumber: settings.numeroCuenta,
      email: settings.correo
    }
  });
}

function buildPaymentConfirmedMessageForOrder(pedido: AdminOrderSummary) {
  return buildOrderPaymentConfirmedMessage({
    customerName: pedido.clienteNombre,
    codigo: pedido.codigo,
    total: pedido.total,
    metodoDespacho: pedido.metodoDespacho as MetodoDespacho | undefined,
    region: pedido.clienteRegion,
    comuna: pedido.clienteComuna,
    direccion: pedido.clienteDireccion
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ pedidoId: string }> }
) {
  if (!(await getAuthenticatedAdmin())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const trustedOriginError = validateTrustedOrigin(request);

  if (trustedOriginError) {
    return trustedOriginError;
  }

  const jsonRequestError = validateJsonRequest(request);

  if (jsonRequestError) {
    return jsonRequestError;
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo JSON no es valido." }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json(
      { error: "El cuerpo debe ser un objeto JSON." },
      { status: 400 }
    );
  }

  const unknownFields = Object.keys(rawBody).filter(
    (key) => !ORDER_ACTION_FIELDS.has(key)
  );

  if (unknownFields.length > 0) {
    return NextResponse.json(
      { error: `Campos no permitidos: ${unknownFields.join(", ")}.` },
      { status: 400 }
    );
  }

  try {
    const body = rawBody as {
      action?: AdminOrdersAction;
      motivoCancelacion?: string;
      confirmarPagoPerdido?: boolean;
      monto?: number;
      metodoPago?: string;
    };
    const { pedidoId } = await context.params;
    const pedidoService = createPedidoService();
    let whatsapp: { message: string } | undefined;
    let pedidoRespuesta: AdminOrderSummary | undefined;

    switch (body.action) {
      case "agendar": {
        // El servidor carga y valida la configuracion bancaria: nunca se
        // confia en datos bancarios enviados por el cliente. Si falta algo,
        // el pedido NO se toca (ni estado, ni stock, ni reserva).
        const { settings, completa } =
          await createBusinessSettingsService().obtenerEstadoConfiguracionPago();

        if (!completa) {
          return NextResponse.json(
            {
              error: "Completa los datos bancarios antes de atender pedidos.",
              code: "CONFIG_INCOMPLETA",
              configuracionUrl: "/admin/configuracion?seccion=transferencia"
            },
            { status: 422 }
          );
        }

        await pedidoService.agendarPedido(pedidoId);
        const pedido = await pedidoService.obtenerPedidoAdminPorId(pedidoId);
        pedidoRespuesta = pedido;
        whatsapp = { message: buildPaymentRequestMessageForOrder(pedido, settings) };
        break;
      }
      case "reenviar-transferencia": {
        // Solo lectura: reabre el mismo mensaje de transferencia de un
        // pedido ya AGENDADO. No transiciona estado, no toca stock/reserva.
        const pedido = await pedidoService.obtenerPedidoAdminPorId(pedidoId);

        if (pedido.estadoPedido !== "AGENDADO") {
          return NextResponse.json(
            { error: "Este pedido no esta agendado." },
            { status: 409 }
          );
        }

        const { settings, completa } =
          await createBusinessSettingsService().obtenerEstadoConfiguracionPago();

        if (!completa) {
          return NextResponse.json(
            {
              error: "Completa los datos bancarios antes de reenviarlos.",
              code: "CONFIG_INCOMPLETA",
              configuracionUrl: "/admin/configuracion?seccion=transferencia"
            },
            { status: 422 }
          );
        }

        pedidoRespuesta = pedido;
        whatsapp = { message: buildPaymentRequestMessageForOrder(pedido, settings) };
        break;
      }
      case "coordinar-entrega": {
        // Solo lectura: reconstruye el mensaje de coordinacion de entrega de
        // un pedido ya pagado. No muta estado, pago, stock ni reserva.
        const pedido = await pedidoService.obtenerPedidoAdminPorId(pedidoId);

        if (!ESTADOS_CON_ENTREGA_COORDINABLE.has(pedido.estadoPedido)) {
          return NextResponse.json(
            { error: "Este pedido no admite coordinar entrega en su estado actual." },
            { status: 409 }
          );
        }

        pedidoRespuesta = pedido;
        whatsapp = { message: buildPaymentConfirmedMessageForOrder(pedido) };
        break;
      }
      case "cancelar": {
        const motivoCancelacion = body.motivoCancelacion?.trim();

        if (!motivoCancelacion) {
          return NextResponse.json(
            { error: "Debes ingresar un motivo de cancelacion." },
            { status: 400 }
          );
        }

        await pedidoService.cancelarPedido(
          pedidoId,
          motivoCancelacion,
          { confirmarPagoPerdido: body.confirmarPagoPerdido }
        );
        pedidoRespuesta = await pedidoService.obtenerPedidoAdminPorId(pedidoId);
        break;
      }
      case "pagado": {
        await pedidoService.marcarPedidoPagado(pedidoId, body.metodoPago || "TRANSFERENCIA");
        const pedido = await pedidoService.obtenerPedidoAdminPorId(pedidoId);
        pedidoRespuesta = pedido;
        whatsapp = { message: buildPaymentConfirmedMessageForOrder(pedido) };
        break;
      }
      case "preparando":
        await pedidoService.iniciarPreparacionPedido(pedidoId);
        break;
      case "despachado":
        await pedidoService.despacharPedido(pedidoId);
        break;
      case "entregado":
        await pedidoService.entregarPedido(pedidoId);
        break;
      case "abonar":
        await pedidoService.registrarAbonoFiado(
          pedidoId,
          body.monto ?? 0,
          body.metodoPago || "EFECTIVO"
        );
        break;
      case "visto":
        await pedidoService.marcarPedidoVisto(pedidoId);
        break;
      default:
        return NextResponse.json(
          { error: "Accion admin no soportada." },
          { status: 400 }
        );
    }

    return NextResponse.json({ ok: true, pedido: pedidoRespuesta, whatsapp });
  } catch (error) {
    // Los errores de mark_perfume_order_paid_v1 / cancel_perfume_order_v1 /
    // advance_perfume_order_status_v1 ya llegan aqui traducidos a espanol y
    // sin detalles internos de PostgreSQL (ver
    // repositories/pedidoRepository.ts + lib/perfumeOrderErrors.ts).
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el pedido."
      },
      { status: httpStatusForPerfumeOrderError(error) }
    );
  }
}
