import { getCurrentDeviceLabel, getOrCreateDeviceId } from "@/lib/pwa/device";
import {
  getNotificationPermissionState,
  isRunningAsInstalledPwa,
  requestNotificationPermission
} from "@/lib/pwa/notifications";
import { registerAdminServiceWorker } from "@/lib/pwa/registerServiceWorker";

type PushManagerLike = Pick<PushManager, "getSubscription" | "subscribe">;

type SubscriptionJson = {
  endpoint: string;
  expirationTime: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function getPublicVapidKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
}

function getWindowPushManager(): PushManagerLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  const windowWithPushManager = window as Window & {
    pushManager?: PushManagerLike;
  };

  return windowWithPushManager.pushManager ?? null;
}

export function isPushNotificationsSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    (Boolean(getWindowPushManager()) || ("serviceWorker" in navigator && "PushManager" in window))
  );
}

function base64UrlToUint8Array(base64UrlString: string) {
  const padding = "=".repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

async function getPreferredPushManager() {
  const windowPushManager = getWindowPushManager();

  if (windowPushManager) {
    void registerAdminServiceWorker().catch(() => {
      // El registro del service worker sigue siendo util para clicks y fallback,
      // pero no bloquea la suscripcion declarativa en Safari/iPhone.
    });
    return windowPushManager;
  }

  const registration = await registerAdminServiceWorker();
  return registration?.pushManager ?? null;
}

export async function getCurrentPushSubscription() {
  if (!isPushNotificationsSupported()) {
    return null;
  }

  const pushManager = await getPreferredPushManager();

  if (!pushManager) {
    return null;
  }

  return pushManager.getSubscription();
}

export async function subscribeCurrentDeviceToPush() {
  const notificationPermission = await getNotificationPermissionState();
  const publicVapidKey = getPublicVapidKey();

  if (!isPushNotificationsSupported()) {
    return {
      ok: false as const,
      error: "PUSH_NOT_SUPPORTED",
      notificationPermission
    };
  }

  if (!publicVapidKey) {
    return {
      ok: false as const,
      error: "MISSING_VAPID_PUBLIC_KEY",
      notificationPermission
    };
  }

  const nextPermission =
    notificationPermission === "default"
      ? await requestNotificationPermission()
      : notificationPermission;

  if (nextPermission !== "granted") {
    return {
      ok: false as const,
      error: "NOTIFICATION_PERMISSION_NOT_GRANTED",
      notificationPermission: nextPermission
    };
  }

  const pushManager = await getPreferredPushManager();

  if (!pushManager) {
    return {
      ok: false as const,
      error: "PUSH_MANAGER_NOT_AVAILABLE",
      notificationPermission: nextPermission
    };
  }

  const existingSubscription = await pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicVapidKey)
    }));

  const response = await fetch("/api/admin/push-subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      deviceId: getOrCreateDeviceId(),
      deviceLabel: getCurrentDeviceLabel(),
      runningAsPwa: isRunningAsInstalledPwa(),
      notificationPermission: nextPermission,
      subscription: subscription.toJSON()
    })
  });

  const data = (await response.json()) as { error?: string };

  if (!response.ok) {
    return {
      ok: false as const,
      error: data.error ?? "NO_FUE_POSIBLE_GUARDAR_LA_SUSCRIPCION",
      notificationPermission: nextPermission
    };
  }

  return {
    ok: true as const,
    notificationPermission: nextPermission,
    subscription
  };
}

export async function unsubscribeCurrentDeviceFromPush() {
  const currentSubscription = await getCurrentPushSubscription();
  const notificationPermission = await getNotificationPermissionState();

  if (currentSubscription) {
    await currentSubscription.unsubscribe();
  }

  await fetch("/api/admin/push-subscriptions", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      deviceId: getOrCreateDeviceId()
    })
  });

  return {
    notificationPermission
  };
}

export async function sendCurrentDevicePushTest() {
  const response = await fetch("/api/admin/push/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      deviceId: getOrCreateDeviceId()
    })
  });

  const data = (await response.json()) as { error?: string; message?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "No fue posible enviar la notificación de prueba.");
  }

  return data.message ?? "Notificación de prueba enviada.";
}

export function serializeSubscription(subscription: PushSubscription | null): SubscriptionJson | null {
  return subscription ? (subscription.toJSON() as SubscriptionJson) : null;
}
