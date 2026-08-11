"use client";

/**
 * Proyecto: Perfume Store (Smellme.cl)
 * Modulo: Edicion segura de nombre de producto
 * Descripcion: Boton "Editar nombre" + modal con "Nombre actual"/"Nuevo
 * nombre" para corregir nombres mal importados (ej. "Savauge" -> "Sauvage")
 * sin crear un producto duplicado, sin cambiar id/SKU y sin tocar stock,
 * costo, precio, Top o Ofertas. El nombre nunca es identidad comercial: esa
 * identidad la dan id y SKU. Ver docs/SMELLME_SAFE_PRODUCT_RENAME_DESIGN.md.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { useState } from "react";
import { useAppFeedback } from "@/hooks/useAppFeedback";
import type { AdminProductRecord } from "@/lib/types";

const MAX_PRODUCT_NAME_LENGTH = 150;
const PRODUCT_NAME_CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

function validateNewName(rawInput: string, currentName: string): string | null {
  if (PRODUCT_NAME_CONTROL_CHAR_PATTERN.test(rawInput)) {
    return "El nombre contiene caracteres no válidos.";
  }
  const trimmed = rawInput.trim();
  if (trimmed.length === 0) {
    return "El nombre no puede estar vacío.";
  }
  if (trimmed.length > MAX_PRODUCT_NAME_LENGTH) {
    return `El nombre no puede superar los ${MAX_PRODUCT_NAME_LENGTH} caracteres.`;
  }
  if (trimmed === currentName.trim()) {
    return "El nombre ingresado es igual al actual.";
  }
  return null;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

function RenameDialog({
  product,
  onClose,
  onSaved
}: {
  product: AdminProductRecord;
  onClose: () => void;
  onSaved: (nuevoNombre: string) => void;
}) {
  const feedback = useAppFeedback();
  const [nuevoNombre, setNuevoNombre] = useState(product.nombre);
  const [fieldError, setFieldError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleGuardar() {
    const validationError = validateNewName(nuevoNombre, product.nombre);
    if (validationError) {
      setFieldError(validationError);
      return;
    }

    setSaving(true);
    try {
      await fetchJson(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "rename", nuevoNombre: nuevoNombre.trim() })
      });
      onSaved(nuevoNombre.trim());
      feedback.success("Nombre actualizado.");
      onClose();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "No fue posible actualizar el nombre.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#191714]/40 px-4 backdrop-blur-sm" role="presentation">
      <button type="button" aria-label="Cerrar" className="absolute inset-0" onClick={onClose} disabled={saving} />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-[30px] border border-[#DDD0C1] bg-white p-6 shadow-[0_24px_60px_rgba(17,19,24,0.18)]">
        <h2 className="text-xl font-semibold text-[#191714]">Editar nombre del perfume</h2>
        <p className="mt-2 text-sm leading-6 text-[#6B6258]">
          El nombre se actualizará en el catálogo y futuras ventas. El historial comercial existente (pedidos, reportes
          y cierres ya realizados) se conservará tal como quedó registrado. El SKU, el stock, el costo, el precio y las
          posiciones de Top/Ofertas no se modifican.
        </p>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#8a8074]">
          Nombre actual
          <input
            type="text"
            value={product.nombre}
            disabled
            className="mt-1 block min-h-11 w-full rounded-xl border border-[#DDD0C1] bg-[#F7F2EA] px-3 py-2 text-sm text-[#6B6258]"
          />
        </label>

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-[#8a8074]">
          Nuevo nombre
          <input
            type="text"
            value={nuevoNombre}
            onChange={(event) => {
              setNuevoNombre(event.target.value);
              if (fieldError) setFieldError("");
            }}
            maxLength={MAX_PRODUCT_NAME_LENGTH}
            disabled={saving}
            autoFocus
            className="mt-1 block min-h-11 w-full rounded-xl border border-[#DDD0C1] px-3 py-2 text-sm text-[#191714]"
          />
        </label>
        {fieldError ? <p className="mt-2 text-xs font-semibold text-[#8a2c22]">{fieldError}</p> : null}

        <p className="mt-3 text-xs leading-5 text-[#8a8074]">
          Si este perfume tiene otras presentaciones (tamaños) con el mismo nombre actual, esta corrección solo aplica a
          esta presentación. Revísalas por separado si también necesitan corregirse.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDD0C1] bg-white px-4 py-3 text-sm font-semibold text-[#191714] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleGuardar()}
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#8A6036] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Guardar cambio"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProductRenameAction({
  product,
  disabled,
  onRenamed
}: {
  product: AdminProductRecord;
  disabled?: boolean;
  onRenamed: (productId: string, nuevoNombre: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="min-h-9 rounded-lg border border-[#DDD0C1] px-3 py-1.5 text-xs font-semibold text-[#191714] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Editar nombre
      </button>
      {open ? (
        <RenameDialog
          product={product}
          onClose={() => setOpen(false)}
          onSaved={(nuevoNombre) => onRenamed(product.id, nuevoNombre)}
        />
      ) : null}
    </>
  );
}
