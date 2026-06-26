import { NextResponse } from "next/server";
import { getAuthenticatedAdmin } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("user_device_badge_settings")
      .select(
        "id, user_id, device_id, device_label, badge_enabled, badge_supported, notification_permission, running_as_pwa, last_badge_count, last_sync_at, created_at, updated_at"
      )
      .eq("user_id", admin.userId)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      setting: data
        ? {
            id: data.id,
            userId: data.user_id,
            deviceId: data.device_id,
            deviceLabel: data.device_label ?? undefined,
            badgeEnabled: data.badge_enabled,
            badgeSupported: data.badge_supported,
            notificationPermission: data.notification_permission ?? undefined,
            runningAsPwa: data.running_as_pwa ?? undefined,
            lastBadgeCount: data.last_badge_count ?? 0,
            lastSyncAt: data.last_sync_at ?? undefined,
            createdAt: data.created_at ?? undefined,
            updatedAt: data.updated_at ?? undefined
          }
        : null
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible obtener la configuracion del badge."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const admin = await getAuthenticatedAdmin();

  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      deviceId?: string;
      deviceLabel?: string;
      badgeEnabled?: boolean;
      badgeSupported?: boolean;
      notificationPermission?: string;
      runningAsPwa?: boolean;
      lastBadgeCount?: number;
      lastSyncAt?: string;
    };

    if (!body.deviceId?.trim()) {
      return NextResponse.json({ error: "deviceId es obligatorio." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const supabase = createSupabaseServerClient();
    const payload = {
      user_id: admin.userId,
      device_id: body.deviceId.trim(),
      device_label: body.deviceLabel?.trim() || null,
      badge_enabled: body.badgeEnabled ?? false,
      badge_supported: body.badgeSupported ?? false,
      notification_permission: body.notificationPermission ?? null,
      running_as_pwa: body.runningAsPwa ?? null,
      last_badge_count: Math.max(0, Math.trunc(body.lastBadgeCount ?? 0)),
      last_sync_at: body.lastSyncAt ?? now,
      updated_at: now
    };

    const { data, error } = await supabase
      .from("user_device_badge_settings")
      .upsert(payload, { onConflict: "user_id,device_id" })
      .select(
        "id, user_id, device_id, device_label, badge_enabled, badge_supported, notification_permission, running_as_pwa, last_badge_count, last_sync_at, created_at, updated_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      setting: {
        id: data.id,
        userId: data.user_id,
        deviceId: data.device_id,
        deviceLabel: data.device_label ?? undefined,
        badgeEnabled: data.badge_enabled,
        badgeSupported: data.badge_supported,
        notificationPermission: data.notification_permission ?? undefined,
        runningAsPwa: data.running_as_pwa ?? undefined,
        lastBadgeCount: data.last_badge_count ?? 0,
        lastSyncAt: data.last_sync_at ?? undefined,
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
            : "No fue posible guardar la configuracion del badge."
      },
      { status: 500 }
    );
  }
}

