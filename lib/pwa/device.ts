const DEVICE_ID_STORAGE_KEY = "smellme_device_id";

export function getOrCreateDeviceId() {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);

  if (existing) {
    return existing;
  }

  const nextId = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextId);
  return nextId;
}

export function getCurrentDeviceLabel() {
  if (typeof window === "undefined") {
    return "admin-web";
  }

  const ua = window.navigator.userAgent || "";

  if (/iphone|ipad|ipod/i.test(ua)) {
    return "iphone";
  }

  if (/android/i.test(ua)) {
    return "android";
  }

  if (/macintosh|mac os x/i.test(ua)) {
    return "mac";
  }

  if (/windows/i.test(ua)) {
    return "windows";
  }

  return "admin-web";
}
