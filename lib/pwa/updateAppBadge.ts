export async function updateAppBadge(count: number) {
  if (typeof navigator === "undefined") {
    return;
  }

  try {
    const safeCount = Number(count) || 0;

    if (safeCount > 0 && "setAppBadge" in navigator) {
      await navigator.setAppBadge(safeCount);
      return;
    }

    if (safeCount <= 0) {
      await clearAppBadgeSafe();
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("No se pudo actualizar el badge de la app.", error);
    }
  }
}

export async function clearAppBadgeSafe() {
  if (typeof navigator === "undefined") {
    return;
  }

  try {
    if ("clearAppBadge" in navigator) {
      await navigator.clearAppBadge();
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("No se pudo limpiar el badge de la app.", error);
    }
  }
}
