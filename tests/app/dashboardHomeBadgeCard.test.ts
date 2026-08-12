import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardHomeView } from "@/components/admin/dashboard/DashboardHomeView";
import type { AdminBadgeDeviceSetting } from "@/lib/types";

/**
 * QA 2026-08-11: la tarjeta "Badge del icono" completa desaparecia del
 * dashboard apenas badgeDeviceSetting?.badgeEnabled pasaba a true, dejando
 * al admin sin forma de ver el estado del dispositivo ni de probar
 * badge/notificacion una vez activado el Push. Estas pruebas renderizan el
 * componente real (SSR, sin jsdom) en ambos estados para evitar que la
 * tarjeta vuelva a ocultarse.
 */

const ACTIVE_BADGE_SETTING: AdminBadgeDeviceSetting = {
  userId: "user-1",
  deviceId: "device-1",
  badgeEnabled: true,
  badgeSupported: true,
  notificationPermission: "granted",
  runningAsPwa: true,
  lastBadgeCount: 2,
  lastSyncAt: "2026-08-11T12:00:00.000Z"
};

function renderDashboardHome(overrides: {
  badgeDeviceSetting: AdminBadgeDeviceSetting | null;
  pushSubscriptionActive: boolean;
  pushSupported?: boolean;
}) {
  return renderToStaticMarkup(
    createElement(DashboardHomeView, {
      attentionCount: 2,
      badgeActionLoading: false,
      badgeCardLoading: false,
      badgeDeviceId: "device-1",
      badgeDeviceSetting: overrides.badgeDeviceSetting,
      badgeSupported: true,
      homeSummary: { agendaHoy: 0, productosActivos: 3, stockTotal: 10, stockCritico: 0 },
      isInstalledPwa: true,
      notificationPermission: "granted",
      pendingUnseenOrders: [],
      paymentSettingsComplete: true,
      pushSubscriptionActive: overrides.pushSubscriptionActive,
      pushSupported: overrides.pushSupported ?? true,
      weekSalesTotal: 0,
      renderNewOrderWhatsAppButton: () => null,
      onActivateBadgeForCurrentDevice: () => {},
      onMarkOrderSeen: () => {},
      onOpenAttentionOrders: () => {},
      onOpenPendingOrderDetail: () => {},
      onTestBadgeOnCurrentDevice: () => {},
      onTestPushOnCurrentDevice: () => {}
    })
  );
}

describe("DashboardHomeView - tarjeta Badge del icono", () => {
  it("permanece visible cuando el badge aun no esta activado (badgeEnabled=false)", () => {
    const html = renderDashboardHome({ badgeDeviceSetting: null, pushSubscriptionActive: false });

    expect(html).toContain("Badge del icono");
    expect(html).toContain("POR ACTIVAR");
    expect(html).toContain("Activar badge y notificaciones");
  });

  it("permanece visible cuando el badge ya esta activado (badgeEnabled=true)", () => {
    const html = renderDashboardHome({
      badgeDeviceSetting: ACTIVE_BADGE_SETTING,
      pushSubscriptionActive: true
    });

    expect(html).toContain("Badge del icono");
  });

  it("muestra el estado ACTIVO cuando badgeEnabled=true", () => {
    const html = renderDashboardHome({
      badgeDeviceSetting: ACTIVE_BADGE_SETTING,
      pushSubscriptionActive: true
    });

    expect(html).toContain("ACTIVO");
    expect(html).not.toContain("POR ACTIVAR");
  });

  it("mantiene visibles Soporte, Modo app, Permiso, Contador actual, Push y ultima sincronizacion cuando esta activo", () => {
    const html = renderDashboardHome({
      badgeDeviceSetting: ACTIVE_BADGE_SETTING,
      pushSubscriptionActive: true
    });

    expect(html).toContain("Soporte");
    expect(html).toContain("Modo app");
    expect(html).toContain("Permiso");
    expect(html).toContain("Contador actual");
    expect(html).toContain("Push");
    expect(html).toContain("Ultima sincronizacion");
  });

  it('muestra el boton "Probar badge" cuando el badge esta activo', () => {
    const html = renderDashboardHome({
      badgeDeviceSetting: ACTIVE_BADGE_SETTING,
      pushSubscriptionActive: false
    });

    expect(html).toContain("Probar badge");
  });

  it('no muestra "Probar badge" cuando el badge todavia no esta activo', () => {
    const html = renderDashboardHome({ badgeDeviceSetting: null, pushSubscriptionActive: false });

    expect(html).not.toContain("Probar badge");
  });

  it('muestra el boton "Probar notificacion" cuando pushSubscriptionActive=true', () => {
    const html = renderDashboardHome({
      badgeDeviceSetting: ACTIVE_BADGE_SETTING,
      pushSubscriptionActive: true
    });

    expect(html).toContain("Probar notificacion");
  });

  it('no muestra "Probar notificacion" cuando no hay suscripcion push activa', () => {
    const html = renderDashboardHome({
      badgeDeviceSetting: ACTIVE_BADGE_SETTING,
      pushSubscriptionActive: false
    });

    expect(html).not.toContain("Probar notificacion");
  });

  it('no muestra el boton de activacion principal una vez que el badge ya esta activo (sin segundo CTA de activacion)', () => {
    const html = renderDashboardHome({
      badgeDeviceSetting: ACTIVE_BADGE_SETTING,
      pushSubscriptionActive: true
    });

    expect(html).not.toContain("Activar badge y notificaciones");
  });

  it("no hay regresiones: las demas secciones del dashboard siguen presentes en ambos estados", () => {
    const inactiveHtml = renderDashboardHome({ badgeDeviceSetting: null, pushSubscriptionActive: false });
    const activeHtml = renderDashboardHome({
      badgeDeviceSetting: ACTIVE_BADGE_SETTING,
      pushSubscriptionActive: true
    });

    for (const html of [inactiveHtml, activeHtml]) {
      expect(html).toContain("Acciones rápidas");
      expect(html).toContain("Pedidos por atender");
      expect(html).toContain("Pedidos pendientes");
    }
  });
});
