import { NextResponse } from "next/server";
import type { CustomerOrderRequest } from "@/lib/types";
import { createPedidoService } from "@/services/pedidoService";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CustomerOrderRequest;
    const pedidoService = createPedidoService();
    const result = await pedidoService.crearPedido(body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible registrar el pedido."
      },
      { status: 400 }
    );
  }
}
