"use client";

import { Search, X } from "lucide-react";

type AdminCatalogSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Buscador comun de "Gestion de catalogo" (Fase 3A). Componente controlado
 * y sin logica de router propia: AdminCatalogShell es quien debounce y
 * sincroniza con `?q=` (una sola fuente de verdad para el termino de
 * busqueda entre secciones).
 */
export function AdminCatalogSearch({ value, onChange }: AdminCatalogSearchProps) {
  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar perfume, marca o contenido"
        aria-label="Buscar perfume, marca o contenido"
        className="w-full rounded-xl border border-[#e4e7ec] bg-white py-2.5 pl-10 pr-9 text-sm text-[#111318] shadow-sm outline-none transition focus:border-[#7357ff] focus:ring-2 focus:ring-[#eeebff]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#98a2b3] hover:bg-[#f2f4f7] hover:text-[#344054]"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
