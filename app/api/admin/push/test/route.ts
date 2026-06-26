import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { getNewAdminOrdersCount } from "@/lib/admin/getPendingAdminOrders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendPendingOrdersPushToAdmins } from "@/lib/pwa/sendWebPush";

export async function POST(request: Request) {
  const admin = await getAuthenticatedAdmin();

  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { deviceId?: string };
    const deviceId = body.deviceId?.trim();

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId es obligatorio." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("admin_push_subscriptions")
      .select("id")
      .eq("user_id", admin.userId)
      .eq("device_id", deviceId)
      .eq("is_active", true);

    if (subscriptionError) {
      throw subscriptionError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json(
        { error: "Este dispositivo aun no tiene notificaciones activadas." },
        { status: 400 }
      );
    }

    const { data: pendingOrders, error: pendingError } = await supabase
      .from("pedidos")
      .select("estado_pedido, admin_seen, fecha_entrega, fecha_agendado")
      .eq("estado_pedido", "PENDIENTE");

    if (pendingError) {
      throw pendingError;
    }

    const pendingCount = getNewAdminOrdersCount(
      (pendingOrders ?? []).map((order) => ({
        estadoPedido: order.estado_pedido,
        adminSeen: order.admin_seen ?? false,
        fechaEntrega: order.fecha_entrega ?? undefined,
        fechaAgendado: order.fecha_agendado ?? undefined
      }))
    );

    const pushResult = await sendPendingOrdersPushToAdmins({
      pendingCount,
      userId: admin.userId,
      deviceId
    });

    if (pushResult.skipped) {
      return NextResponse.json(
        {
          error:
            pushResult.reason === "VAPID_NOT_CONFIGURED"
              ? "Faltan variables VAPID para enviar Web Push."
              : "Este dispositivo aun no tiene una suscripcion push activa."
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Notificación de prueba enviada al dispositivo actual."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible enviar la notificación de prueba."
      },
      { status: 500 }
    );
  }
}
