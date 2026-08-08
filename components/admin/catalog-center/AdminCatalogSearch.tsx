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
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C8175]" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar perfume, marca o contenido"
        aria-label="Buscar perfume, marca o contenido"
        className="w-full rounded-xl border border-[#DDD0C1] bg-white py-2.5 pl-10 pr-9 text-sm text-[#191714] shadow-sm outline-none transition focus:border-[#B88B58] focus:ring-2 focus:ring-[#F4E8DB]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#8C8175] hover:bg-[#EEE5DA] hover:text-[#4D453D]"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
