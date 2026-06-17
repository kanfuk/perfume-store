import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import type { CustomOrderRequest } from "@/lib/types";
import { createPedidoService } from "@/services/pedidoService";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CustomOrderRequest;
    const pedidoService = createPedidoService();
    const result = await pedidoService.crearPedidoPersonalizado(body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible registrar el pedido personalizado."
      },
      { status: 400 }
    );
  }
}
