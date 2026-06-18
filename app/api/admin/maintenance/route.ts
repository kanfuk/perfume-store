import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import type { AdminMaintenanceAction } from "@/lib/types";
import { createAdminMaintenanceService } from "@/services/adminMaintenanceService";

export async function POST(request: Request) {
  const admin = await getAuthenticatedAdmin();

  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: AdminMaintenanceAction;
    };

    if (body.action !== "close-month" && body.action !== "clear-test-data") {
      return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
    }

    const service = createAdminMaintenanceService();
    const result = await service.run(body.action, {
      email: admin.email,
      nombre: admin.nombre
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible ejecutar la operación."
      },
      { status: 400 }
    );
  }
}
