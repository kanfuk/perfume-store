import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { createPedidoService } from "@/services/pedidoService";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const pedidoService = createPedidoService();
    const dashboard = await pedidoService.obtenerDashboardAdmin();

    return NextResponse.json(dashboard);
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
