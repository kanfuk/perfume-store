import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { ESTADO_PEDIDO_AGENDADO, ESTADO_PEDIDO_PENDIENTE } from "@/lib/constants";
import { createPedidoService } from "@/services/pedidoService";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const pedidoService = createPedidoService();
    const [pendientes, agendados] = await Promise.all([
      pedidoService.obtenerPedidosPorEstado(ESTADO_PEDIDO_PENDIENTE),
      pedidoService.obtenerPedidosPorEstado(ESTADO_PEDIDO_AGENDADO)
    ]);

    return NextResponse.json({ pendientes, agendados });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible cargar pedidos admin."
      },
      { status: 500 }
    );
  }
}
