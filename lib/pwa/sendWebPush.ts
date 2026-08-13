import webpush, { type PushSubscription } from "web-push";
import { getAdminUrl } from "@/lib/public-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SendPendingOrdersPushArgs = {
  pendingCount: number;
  pedidoId?: string;
  userId?: string;
  deviceId?: string;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type SendPendingOrdersPushResult = {
  sent: number;
  failed: number;
  expired: number;
  skipped: boolean;
  reason?: string;
};

let vapidConfigured = false;

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();

  return {
    publicKey,
    privateKey,
    subject,
    isConfigured: Boolean(publicKey && privateKey && subject)
  };
}

function ensureVapidDetails() {
  if (vapidConfigured) {
    return true;
  }

  const vapid = getVapidConfig();

  if (!vapid.isConfigured || !vapid.publicKey || !vapid.privateKey || !vapid.subject) {
    return false;
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  vapidConfigured = true;
  return true;
}

function buildPushSubscription(row: PushSubscriptionRow): PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth
    }
  };
}

async function deactivatePushSubscription(id: string) {
  const supabase = createSupabaseServerClient();

  await supabase
    .from("admin_push_subscriptions")
    .update({ is_active: false })
    .eq("id", id);
}

function buildDeclarativePushPayload(args: SendPendingOrdersPushArgs) {
  const pendingCount = Math.max(0, Math.trunc(args.pendingCount));
  const title = pendingCount > 0 ? "Nuevo pedido en Smellme" : "Pedidos actualizados";
  const body =
    pendingCount > 0
      ? "Tienes un nuevo pedido pendiente de revisión."
      : "No quedan pedidos pendientes por revisar.";
  const navigateUrl = getAdminUrl("/admin/pedidos");

  return JSON.stringify({
    web_push: 8030,
    notification: {
      title,
      body,
      navigate: navigateUrl,
      app_badge: String(pendingCount),
      tag: "smellme-admin-pending-orders",
      icon: "/icons/android-chrome-192x192.png",
      badge: "/icons/android-chrome-192x192.png",
      data: {
        url: navigateUrl,
        pendingCount,
        pedidoId: args.pedidoId
      }
    },
    title,
    body,
    pendingCount,
    pedidoId: args.pedidoId,
    url: navigateUrl
  });
}

type SubscriptionSendOutcome = "sent" | "expired" | "failed";

async function sendToSubscription(subscriptionRow: PushSubscriptionRow, payload: string): Promise<SubscriptionSendOutcome> {
  try {
    await webpush.sendNotification(buildPushSubscription(subscriptionRow), payload);
    return "sent";
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;

    if (statusCode === 404 || statusCode === 410) {
      await deactivatePushSubscription(subscriptionRow.id);
      return "expired";
    }

    return "failed";
  }
}

export async function sendPendingOrdersPushToAdmins(
  args: SendPendingOrdersPushArgs
): Promise<SendPendingOrdersPushResult> {
  if (!ensureVapidDetails()) {
    return {
      sent: 0,
      failed: 0,
      expired: 0,
      skipped: true,
      reason: "VAPID_NOT_CONFIGURED"
    };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("admin_push_subscriptions")
    .select("id, user_id, device_id, endpoint, p256dh, auth")
    .eq("is_active", true);

  if (error) {
    return {
      sent: 0,
      failed: 0,
      expired: 0,
      skipped: true,
      reason: "SUBSCRIPTIONS_QUERY_FAILED"
    };
  }

  const filteredSubscriptions = (data ?? []).filter((subscription) => {
    if (args.userId && subscription.user_id !== args.userId) {
      return false;
    }

    if (args.deviceId && subscription.device_id !== args.deviceId) {
      return false;
    }

    return true;
  });

  if (filteredSubscriptions.length === 0) {
    return {
      sent: 0,
      failed: 0,
      expired: 0,
      skipped: true,
      reason: "NO_ACTIVE_SUBSCRIPTIONS"
    };
  }

  const payload = buildDeclarativePushPayload(args);

  const outcomes = await Promise.all(
    filteredSubscriptions.map((subscriptionRow) => sendToSubscription(subscriptionRow, payload))
  );

  return {
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    expired: outcomes.filter((outcome) => outcome === "expired").length,
    skipped: false
  };
}
