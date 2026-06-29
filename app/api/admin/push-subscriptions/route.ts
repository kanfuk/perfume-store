import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { validateJsonRequest, validateTrustedOrigin } from "@/lib/http-security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PushSubscriptionBody = {
  deviceId?: string;
  deviceLabel?: string;
  notificationPermission?: string;
  runningAsPwa?: boolean;
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
};

export async function GET(request: Request) {
  const admin = await getAuthenticatedAdmin();

  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId")?.trim();

  if (!deviceId) {
    return NextResponse.json({ error: "deviceId es obligatorio." }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("admin_push_subscriptions")
    .select(
      "id, user_id, device_id, endpoint, p256dh, auth, device_label, notification_permission, running_as_pwa, is_active, last_seen_at, created_at, updated_at"
    )
    .eq("user_id", admin.userId)
    .eq("device_id", deviceId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    subscription: data
      ? {
          id: data.id,
          userId: data.user_id,
          deviceId: data.device_id,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          deviceLabel: data.device_label ?? undefined,
          notificationPermission: data.notification_permission ?? undefined,
          runningAsPwa: data.running_as_pwa ?? undefined,
          isActive: data.is_active,
          lastSeenAt: data.last_seen_at ?? undefined,
          createdAt: data.created_at ?? undefined,
          updatedAt: data.updated_at ?? undefined
        }
      : null
  });
}

export async function POST(request: Request) {
  const admin = await getAuthenticatedAdmin();

  if (!admin) {
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
    const body = (await request.json()) as PushSubscriptionBody;
    const deviceId = body.deviceId?.trim();
    const endpoint = body.subscription?.endpoint?.trim();
    const p256dh = body.subscription?.keys?.p256dh?.trim();
    const auth = body.subscription?.keys?.auth?.trim();

    if (!deviceId || !endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "deviceId y suscripcion push completos son obligatorios." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const supabase = createSupabaseServerClient();
    const payload = {
      user_id: admin.userId,
      device_id: deviceId,
      endpoint,
      p256dh,
      auth,
      device_label: body.deviceLabel?.trim() || null,
      notification_permission: body.notificationPermission ?? null,
      running_as_pwa: body.runningAsPwa ?? null,
      is_active: true,
      last_seen_at: now,
      updated_at: now
    };

    const { data, error } = await supabase
      .from("admin_push_subscriptions")
      .upsert(payload, { onConflict: "user_id,device_id,endpoint" })
      .select(
        "id, user_id, device_id, endpoint, p256dh, auth, device_label, notification_permission, running_as_pwa, is_active, last_seen_at, created_at, updated_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      subscription: {
        id: data.id,
        userId: data.user_id,
        deviceId: data.device_id,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        deviceLabel: data.device_label ?? undefined,
        notificationPermission: data.notification_permission ?? undefined,
        runningAsPwa: data.running_as_pwa ?? undefined,
        isActive: data.is_active,
        lastSeenAt: data.last_seen_at ?? undefined,
        createdAt: data.created_at ?? undefined,
        updatedAt: data.updated_at ?? undefined
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible guardar la suscripcion push."
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await getAuthenticatedAdmin();

  if (!admin) {
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
    const body = (await request.json()) as { deviceId?: string };
    const deviceId = body.deviceId?.trim();

    if (!deviceId) {
      return NextResponse.json({ error: "deviceId es obligatorio." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("admin_push_subscriptions")
      .update({ is_active: false })
      .eq("user_id", admin.userId)
      .eq("device_id", deviceId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible desactivar la suscripcion push."
      },
      { status: 500 }
    );
  }
}
