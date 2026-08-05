import { NextResponse } from "next/server";
import { getAuthenticatedAdmin, isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createAdminCustomerService } from "@/services/adminCustomerService";

type RouteContext = {
  params: Promise<{
    customerId: string;
  }>;
};

/**
 * Banlist (Fase 7.5A): el mismo endpoint de edicion se extiende con un
 * `action` opcional en el body -- sin `action`, se mantiene exactamente el
 * flujo de edicion existente (nombre/rut/email/telefono/...). Con
 * `action: "block"|"unblock"`, se enruta a los metodos dedicados del
 * servicio en vez de reconstruir la ficha completa del cliente.
 */
export async function PATCH(request: Request, context: RouteContext) {
  if (!(await isAdminAuthenticated())) {
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

  try {
    const { customerId } = await context.params;
    const body = (await request.json()) as {
      action?: "block" | "unblock";
      reason?: unknown;
      nombre?: string;
      rut?: string;
      email?: string;
      telefono?: string;
      region?: string;
      comuna?: string;
      direccion?: string;
      referenciaDireccion?: string;
      lugarTrabajo?: string;
    };

    const service = createAdminCustomerService();

    if (body.action === "block") {
      const admin = await getAuthenticatedAdmin();
      const customer = await service.bloquearCliente({
        id: customerId,
        motivo: body.reason,
        bloqueadoPor: admin?.userId ?? null
      });
      return NextResponse.json({ customer });
    }

    if (body.action === "unblock") {
      const customer = await service.desbloquearCliente(customerId);
      return NextResponse.json({ customer });
    }

    const customer = await service.actualizarCliente({
      id: customerId,
      nombre: body.nombre ?? "",
      rut: body.rut,
      email: body.email,
      telefono: body.telefono ?? "",
      region: body.region,
      comuna: body.comuna,
      direccion: body.direccion,
      referenciaDireccion: body.referenciaDireccion,
      lugarTrabajo: body.lugarTrabajo ?? ""
    });

    return NextResponse.json({ customer });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible actualizar el cliente."
      },
      { status: 400 }
    );
  }
}
