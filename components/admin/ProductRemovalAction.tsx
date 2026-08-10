"use client";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Eliminacion segura de productos (V2.2.1)
 * Descripcion: Boton "Eliminar / Retirar" (o "Reactivar" para un producto
 * ya archivado) por producto, con vista previa de elegibilidad, popups de
 * confirmacion diferenciados (archive vs hard delete) y mensaje de bloqueo
 * dedicado (semana abierta / pedidos activos). Usa el sistema de feedback
 * compartido (useAppFeedback) en vez de window.alert/confirm.
 * Ver docs/SMELLME_SAFE_PRODUCT_REMOVAL_DESIGN.md.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { useState } from "react";
import { useAppFeedback } from "@/hooks/useAppFeedback";
import type { AdminProductRecord, ProductRemovalEligibility } from "@/lib/types";

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

type BlockedInfo = {
  title: string;
  description: string;
  showCierresLink: boolean;
};

function describeBlock(reason: ProductRemovalEligibility["reason"]): BlockedInfo {
  if (reason === "PRODUCT_HAS_OPEN_WEEK_SALES") {
    return {
      title: "No se puede eliminar este perfume",
      description:
        "Este perfume registra ventas en una semana que aún no ha sido cerrada. Realiza primero el cierre semanal correspondiente para conservar correctamente la información de ventas, costos y rentabilidad. Una vez cerrado el período podrás retirar el perfume del catálogo.",
      showCierresLink: true
    };
  }

  return {
    title: "No se puede eliminar este perfume",
    description: "Este producto todavía forma parte de pedidos activos. Finaliza o cancela esos pedidos antes de retirarlo del catálogo.",
    showCierresLink: false
  };
}

/** Popup informativo de bloqueo: no es una decision si/no, por eso no reutiliza ConfirmDialog (siempre 2 acciones simetricas). */
function BlockedInfoDialog({ info, onClose }: { info: BlockedInfo; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#191714]/40 px-4 backdrop-blur-sm" role="presentation">
      <button type="button" aria-label="Cerrar aviso" className="absolute inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-[30px] border border-[#DDD0C1] bg-white p-6 shadow-[0_24px_60px_rgba(17,19,24,0.18)]">
        <h2 className="text-xl font-semibold text-[#191714]">{info.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B6258]">{info.description}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDD0C1] bg-white px-4 py-3 text-sm font-semibold text-[#191714]"
          >
            Entendido
          </button>
          {info.showCierresLink ? (
            <a
              href="/admin"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#8A6036] px-4 py-3 text-sm font-semibold text-white"
            >
              Ir a cierres
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProductRemovalAction({
  product,
  disabled,
  onArchived,
  onDeleted,
  onReactivated
}: {
  product: AdminProductRecord;
  disabled?: boolean;
  onArchived: (productId: string) => void;
  onDeleted: (productId: string) => void;
  onReactivated: (productId: string) => void;
}) {
  const feedback = useAppFeedback();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<BlockedInfo | null>(null);

  async function handleReactivar() {
    const confirmed = await feedback.confirm({
      title: "Reactivar producto archivado",
      description: `"${product.nombre}" volverá a estar disponible en el catálogo. Repone su stock si es necesario.`,
      confirmLabel: "Reactivar producto",
      cancelLabel: "Cancelar",
      tone: "default"
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await fetchJson(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "toggle", activo: true })
      });
      onReactivated(product.id);
      feedback.success("Producto reactivado.");
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "No fue posible reactivar el producto.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEliminar() {
    setBusy(true);
    try {
      const eligibility = (await fetchJson(
        `/api/admin/products/${product.id}/removal-eligibility`
      )) as ProductRemovalEligibility;

      if (eligibility.mode === "BLOCKED") {
        setBlocked(describeBlock(eligibility.reason));
        return;
      }

      const isArchive = eligibility.mode === "ARCHIVE";
      const confirmed = await feedback.confirm(
        isArchive
          ? {
              title: "Retirar perfume del catálogo",
              description:
                "Este perfume posee historial de ventas ya cerrado. Se retirará del catálogo y no podrá venderse nuevamente, pero sus ventas, clientes, costos, reportes y cierres históricos se conservarán.",
              confirmLabel: "Retirar perfume",
              cancelLabel: "Cancelar",
              tone: "danger"
            }
          : {
              title: "Eliminar perfume",
              description: "Este perfume no registra ventas ni pedidos asociados. Se eliminará definitivamente del catálogo.",
              confirmLabel: "Eliminar perfume",
              cancelLabel: "Cancelar",
              tone: "danger"
            }
      );
      if (!confirmed) return;

      const response = await fetchJson(`/api/admin/products/${product.id}`, { method: "DELETE" });

      if (response.mode === "HARD_DELETE") {
        onDeleted(product.id);
        feedback.success("Perfume eliminado con éxito.");
      } else {
        onArchived(product.id);
        feedback.success("Perfume retirado del catálogo con éxito. Su historial de ventas se mantiene disponible en reportes.");
      }
    } catch (error) {
      // El backend revalida en el momento exacto de confirmar (evitar
      // TOCTOU, seccion 10/11 del encargo): si una venta o pedido nuevo
      // aparecio entre la vista previa y esta confirmacion, la mutacion
      // responde 409 con el mismo mensaje que el bloqueo de elegibilidad.
      const message = error instanceof Error ? error.message : "";
      if (
        message === "No se puede eliminar hasta realizar el cierre de ventas semanal." ||
        message === "El perfume forma parte de pedidos activos y todavia no puede eliminarse."
      ) {
        setBlocked(describeBlock(message.startsWith("No se puede eliminar hasta") ? "PRODUCT_HAS_OPEN_WEEK_SALES" : "PRODUCT_HAS_ACTIVE_ORDERS"));
        return;
      }
      feedback.error("No fue posible eliminar el perfume. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void (product.archivedAt ? handleReactivar() : handleEliminar())}
        disabled={disabled || busy}
        className="min-h-9 rounded-lg border border-[#DDD0C1] px-3 py-1.5 text-xs font-semibold text-[#8a2c22] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Procesando…" : product.archivedAt ? "Reactivar" : "Eliminar / Retirar"}
      </button>
      {blocked ? <BlockedInfoDialog info={blocked} onClose={() => setBlocked(null)} /> : null}
    </>
  );
}
