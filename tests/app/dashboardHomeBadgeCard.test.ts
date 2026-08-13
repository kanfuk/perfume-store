import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardHomeView } from "@/components/admin/dashboard/DashboardHomeView";

function renderDashboardHome() {
  return renderToStaticMarkup(
    createElement(DashboardHomeView, {
      attentionCount: 2,
      homeSummary: {
        agendaHoy: 0,
        productosActivos: 3,
        stockTotal: 10,
        stockCritico: 0
      },
      pendingUnseenOrders: [],
      paymentSettingsComplete: true,
      weekSalesTotal: 0,
      renderNewOrderWhatsAppButton: () => null,
      onMarkOrderSeen: () => {},
      onOpenAttentionOrders: () => {},
      onOpenPendingOrderDetail: () => {}
    })
  );
}

describe("DashboardHomeView - Push fuera del dashboard", () => {
  it("mantiene el resumen operativo y elimina la tarjeta Push permanente", () => {
    const html = renderDashboardHome();

    expect(html).toContain("Acciones rápidas");
    expect(html).toContain("Pedidos por atender");
    expect(html).toContain("Pedidos pendientes");
    expect(html).not.toContain("Badge del icono");
    expect(html).not.toContain("Probar badge");
    expect(html).not.toContain("Probar notificacion");
  });

  it("ubica los controles en Configuracion > Notificaciones push", () => {
    const settings = readFileSync(
      "components/admin/AdminPushSettingsPanel.tsx",
      "utf8"
    );
    const businessSettings = readFileSync(
      "components/admin/BusinessSettingsPanel.tsx",
      "utf8"
    );

    expect(businessSettings).toContain('label: "Notificaciones push"');
    expect(businessSettings).toContain("<AdminPushSettingsPanel");
    expect(settings).toContain("Probar badge");
    expect(settings).toContain("Probar notificación");
    expect(settings).toContain("Reparar suscripción");
    expect(settings).toContain("Desactivar en este dispositivo");
  });
});
