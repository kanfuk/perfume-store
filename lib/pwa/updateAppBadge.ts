export async function updateAppBadge(count: number) {
  if (typeof navigator === "undefined") {
    return;
  }

  try {
    if (count > 0 && "setAppBadge" in navigator) {
      await navigator.setAppBadge(count);
      return;
    }

    if ("clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("No se pudo actualizar el badge de la app.", error);
    }
  }
}
