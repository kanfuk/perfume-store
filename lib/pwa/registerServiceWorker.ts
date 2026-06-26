export function isServiceWorkerSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator;
}

export async function registerAdminServiceWorker() {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  const registration = await navigator.serviceWorker.register("/admin-sw.js", {
    scope: "/"
  });

  await navigator.serviceWorker.ready;

  return registration;
}
