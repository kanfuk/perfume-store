"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getOrCreateDeviceId } from "@/lib/pwa/device";
import {
  getNotificationPermissionState,
  isAppBadgeSupported,
  isRunningAsInstalledPwa,
  requestBadgePermissionForCurrentDevice
} from "@/lib/pwa/notifications";
import {
  getCurrentPushSubscription,
  isPushNotificationsSupported,
  sendCurrentDevicePushTest,
  subscribeCurrentDeviceToPush,
  unsubscribeCurrentDeviceFromPush
} from "@/lib/pwa/push";
import { clearAppBadgeSafe, updateAppBadge } from "@/lib/pwa/updateAppBadge";
import type { AdminBadgeDeviceSetting } from "@/lib/types";

function subscribeToClientSnapshot() {
  return () => undefined;
}

function getEmptyClientSnapshot() {
  return "";
}

function getFalseClientSnapshot() {
  return false;
}

function getCurrentDeviceLabel() {
  if (typeof navigator === "undefined") return "Dispositivo";
  const platform = navigator.platform?.trim();
  return platform ? `iPhone/${platform}` : "iPhone";
}

export function useAdminPushSettings(currentBadgeCount?: number) {
  const deviceId = useSyncExternalStore(
    subscribeToClientSnapshot,
    getOrCreateDeviceId,
    getEmptyClientSnapshot
  );
  const badgeSupported = useSyncExternalStore(
    subscribeToClientSnapshot,
    isAppBadgeSupported,
    getFalseClientSnapshot
  );
  const pushSupported = useSyncExternalStore(
    subscribeToClientSnapshot,
    isPushNotificationsSupported,
    getFalseClientSnapshot
  );
  const isInstalledPwa = useSyncExternalStore(
    subscribeToClientSnapshot,
    isRunningAsInstalledPwa,
    getFalseClientSnapshot
  );
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported"
  );
  const [badgeSetting, setBadgeSetting] = useState<AdminBadgeDeviceSetting | null>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [serverSubscriptionActive, setServerSubscriptionActive] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    if (!deviceId) return;

    try {
      setLoaded(false);
      setError("");
      const [nextPermission, badgeResponse, pushResponse, localSubscription] =
        await Promise.all([
          getNotificationPermissionState(),
          fetch(`/api/admin/badge-settings?deviceId=${encodeURIComponent(deviceId)}`, {
            cache: "no-store"
          }),
          fetch(`/api/admin/push-subscriptions?deviceId=${encodeURIComponent(deviceId)}`, {
            cache: "no-store"
          }),
          getCurrentPushSubscription().catch(() => null)
        ]);
      const badgePayload = (await badgeResponse.json()) as {
        error?: string;
        setting?: AdminBadgeDeviceSetting | null;
      };
      const pushPayload = (await pushResponse.json()) as {
        error?: string;
        subscription?: { isActive?: boolean } | null;
      };

      if (!badgeResponse.ok) {
        throw new Error(badgePayload.error ?? "No fue posible cargar el badge.");
      }
      if (!pushResponse.ok) {
        throw new Error(pushPayload.error ?? "No fue posible cargar las notificaciones.");
      }

      const isServerActive = pushPayload.subscription?.isActive === true;
      setPermission(nextPermission);
      setBadgeSetting(badgePayload.setting ?? null);
      setServerSubscriptionActive(isServerActive);
      setSubscriptionActive(
        nextPermission === "granted" && isServerActive && Boolean(localSubscription)
      );
    } catch (currentError) {
      setSubscriptionActive(false);
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible cargar la configuracion de notificaciones."
      );
    } finally {
      setLoaded(true);
    }
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!badgeSetting?.badgeEnabled || currentBadgeCount === undefined || !deviceId) return;

    const lastSyncAt = new Date().toISOString();
    setBadgeSetting((current) =>
      current
        ? { ...current, lastBadgeCount: currentBadgeCount, lastSyncAt }
        : current
    );
    void updateAppBadge(currentBadgeCount);
    void fetch("/api/admin/badge-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        deviceLabel: getCurrentDeviceLabel(),
        badgeEnabled: true,
        badgeSupported,
        notificationPermission: permission,
        runningAsPwa: isInstalledPwa,
        lastBadgeCount: currentBadgeCount,
        lastSyncAt
      })
    }).catch(() => undefined);
  }, [
    badgeSetting?.badgeEnabled,
    badgeSupported,
    currentBadgeCount,
    deviceId,
    isInstalledPwa,
    permission
  ]);

  const activate = useCallback(async () => {
    if (!deviceId || actionLoading) return false;
    if (permission === "denied") {
      setError("Las notificaciones estan bloqueadas. Habilitalas desde el navegador o sistema.");
      return false;
    }

    try {
      setActionLoading(true);
      setError("");
      setSuccess("");
      const badgeResult = await requestBadgePermissionForCurrentDevice();
      setPermission(badgeResult.notificationPermission);

      const badgeResponse = await fetch("/api/admin/badge-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          deviceLabel: getCurrentDeviceLabel(),
          badgeEnabled: badgeResult.enabled,
          badgeSupported: badgeResult.badgeSupported,
          notificationPermission: badgeResult.notificationPermission,
          runningAsPwa: badgeResult.runningAsPwa,
          lastBadgeCount: badgeResult.enabled ? currentBadgeCount ?? 0 : 0,
          lastSyncAt: new Date().toISOString()
        })
      });
      const badgePayload = (await badgeResponse.json()) as {
        error?: string;
        setting?: AdminBadgeDeviceSetting;
      };
      if (!badgeResponse.ok) {
        throw new Error(badgePayload.error ?? "No fue posible guardar el badge.");
      }
      setBadgeSetting(badgePayload.setting ?? null);

      if (!pushSupported) {
        setSuccess(
          badgeResult.enabled
            ? "Badge activo. Este dispositivo no admite notificaciones push."
            : "Este dispositivo no admite notificaciones push ni badge."
        );
        return false;
      }

      const pushResult = await subscribeCurrentDeviceToPush();
      setPermission(pushResult.notificationPermission);
      if (!pushResult.ok) {
        setSubscriptionActive(false);
        setError(
          pushResult.notificationPermission === "denied"
            ? "Las notificaciones estan bloqueadas. Habilitalas desde el navegador o sistema."
            : "No fue posible activar Push. Puedes volver a intentarlo desde esta configuracion."
        );
        return false;
      }

      setServerSubscriptionActive(true);
      setSubscriptionActive(true);
      if (badgeResult.enabled) await updateAppBadge(currentBadgeCount ?? 0);
      setSuccess(
        badgeResult.enabled
          ? "Badge y notificaciones activados en este dispositivo."
          : "Notificaciones push activadas en este dispositivo."
      );
      return true;
    } catch (currentError) {
      setSubscriptionActive(false);
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible activar las notificaciones."
      );
      return false;
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, currentBadgeCount, deviceId, permission, pushSupported]);

  const testBadge = useCallback(async () => {
    try {
      setActionLoading(true);
      setError("");
      setSuccess("");
      if ("setAppBadge" in navigator) await navigator.setAppBadge(1);
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      await updateAppBadge(currentBadgeCount ?? badgeSetting?.lastBadgeCount ?? 0);
      setSuccess("Badge probado y sincronizado con los pedidos pendientes.");
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible probar el badge en este dispositivo."
      );
    } finally {
      setActionLoading(false);
    }
  }, [badgeSetting?.lastBadgeCount, currentBadgeCount]);

  const testPush = useCallback(async () => {
    try {
      setActionLoading(true);
      setError("");
      setSuccess("");
      setSuccess(await sendCurrentDevicePushTest());
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible probar las notificaciones push."
      );
    } finally {
      setActionLoading(false);
    }
  }, []);

  const deactivate = useCallback(async () => {
    if (!deviceId || actionLoading) return;
    try {
      setActionLoading(true);
      setError("");
      setSuccess("");
      const result = await unsubscribeCurrentDeviceFromPush();
      const response = await fetch("/api/admin/badge-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          deviceLabel: getCurrentDeviceLabel(),
          badgeEnabled: false,
          badgeSupported,
          notificationPermission: result.notificationPermission,
          runningAsPwa: isInstalledPwa,
          lastBadgeCount: 0,
          lastSyncAt: new Date().toISOString()
        })
      });
      const payload = (await response.json()) as {
        error?: string;
        setting?: AdminBadgeDeviceSetting;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "No fue posible desactivar el badge.");
      }
      await clearAppBadgeSafe();
      setBadgeSetting(payload.setting ?? null);
      setPermission(result.notificationPermission);
      setServerSubscriptionActive(false);
      setSubscriptionActive(false);
      setSuccess("Notificaciones y badge desactivados en este dispositivo.");
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "No fue posible desactivar las notificaciones."
      );
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, badgeSupported, deviceId, isInstalledPwa]);

  return {
    actionLoading,
    activate,
    badgeSetting,
    badgeSupported,
    deactivate,
    deviceId,
    error,
    isInstalledPwa,
    loaded,
    permission,
    pushSupported,
    reload: load,
    serverSubscriptionActive,
    subscriptionActive,
    success,
    testBadge,
    testPush
  };
}
