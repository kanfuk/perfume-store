export function isAppBadgeSupported() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return "setAppBadge" in navigator || "clearAppBadge" in navigator;
}

export function isNotificationSupported() {
  if (typeof window === "undefined") {
    return false;
  }

  return "Notification" in window;
}

export async function getNotificationPermissionState() {
  if (!isNotificationSupported()) {
    return "unsupported" as const;
  }

  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (!isNotificationSupported()) {
    return "unsupported" as const;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return "denied" as const;
  }
}

export function isRunningAsInstalledPwa() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type BadgePermissionRequestResult = {
  badgeSupported: boolean;
  notificationSupported: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  runningAsPwa: boolean;
  enabled: boolean;
  error: string | null;
};

export async function requestBadgePermissionForCurrentDevice(): Promise<BadgePermissionRequestResult> {
  const result: BadgePermissionRequestResult = {
    badgeSupported: false,
    notificationSupported: false,
    notificationPermission: "unsupported",
    runningAsPwa: false,
    enabled: false,
    error: null
  };

  try {
    result.badgeSupported = isAppBadgeSupported();
    result.notificationSupported = isNotificationSupported();
    result.runningAsPwa = isRunningAsInstalledPwa();

    if (!result.badgeSupported) {
      result.error = "BADGE_NOT_SUPPORTED";
      return result;
    }

    if (result.notificationSupported) {
      const currentPermission = Notification.permission;
      result.notificationPermission =
        shouldRequestNotificationPermission(currentPermission)
          ? await Notification.requestPermission()
          : currentPermission;

      if (result.notificationPermission === "denied") {
        result.error = "NOTIFICATION_PERMISSION_DENIED";
        return result;
      }
    }

    if ("setAppBadge" in navigator) {
      await navigator.setAppBadge(1);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 800));

    if ("clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
    }

    result.enabled = true;
    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : "UNKNOWN_BADGE_ERROR";
    return result;
  }
}
import { shouldRequestNotificationPermission } from "@/lib/pwa/admin-push-state";
