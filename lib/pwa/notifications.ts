export async function getNotificationPermissionState() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported" as const;
  }

  return Notification.permission;
}

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
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
