export async function updateAppBadge(count: number) {
  if (typeof navigator === "undefined") {
    return;
  }

  try {
    const canSetBadge = "setAppBadge" in navigator;
    const canClearBadge = "clearAppBadge" in navigator;

    if (!canSetBadge || !canClearBadge) {
      return;
    }

    if (count > 0) {
      await navigator.setAppBadge(count);
      return;
    }

    await navigator.clearAppBadge();
  } catch (error) {
    console.warn("No se pudo actualizar el badge de la app.", error);
  }
}
