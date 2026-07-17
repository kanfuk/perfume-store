import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createAdminCustomerService } from "@/services/adminCustomerService";

type RouteContext = {
  params: Promise<{
    customerId: string;
  }>;
};

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
      nombre?: string;
      telefono?: string;
      lugarTrabajo?: string;
    };

    const service = createAdminCustomerService();
    const customer = await service.actualizarCliente({
      id: customerId,
      nombre: body.nombre ?? "",
      telefono: body.telefono ?? "",
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
