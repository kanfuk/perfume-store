"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, UsersRound, X } from "lucide-react";
import { ADMIN_PRIMARY_NAV, ADMIN_MORE_NAV } from "@/components/admin/dashboard/admin-dashboard.constants";

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isMoreActive(pathname: string, isOwner: boolean): boolean {
  return [...ADMIN_MORE_NAV, ...(isOwner ? [{ href: "/admin/usuarios" }] : [])].some((item) => isActive(pathname, item.href));
}

/**
 * Navegacion unica del panel admin (Fase F): misma fuente de datos
 * (ADMIN_PRIMARY_NAV / ADMIN_MORE_NAV) para escritorio (barra compacta,
 * arriba) y movil (barra inferior + hoja "Más"). Nunca coexisten ambas a la
 * vez (una es `hidden sm:flex`, la otra `sm:hidden`). Todos los destinos son
 * <Link> reales a rutas existentes -- nunca cambia un estado `view` en el
 * cliente para decidir que mostrar, asi se evita el salto entre una
 * pantalla vieja y la nueva al navegar (ver docs del fix de Stock).
 */
export function AdminNav({ isOwner = false }: { isOwner?: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Navegación principal"
        className="sticky top-0 z-20 hidden max-w-full items-center gap-2 border-b border-[#DDD0C1] bg-[#F7F1E8]/95 px-1 py-2 backdrop-blur sm:flex"
      >
        {ADMIN_PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
                active
                  ? "border-[#B88B58] bg-[#F4E8DB] text-[#8A6036]"
                  : "border-[#DDD0C1] bg-white text-[#4D453D] hover:border-[#D8BEA2]"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${
              moreOpen || isMoreActive(pathname, isOwner)
                ? "border-[#B88B58] bg-[#F4E8DB] text-[#8A6036]"
                : "border-[#DDD0C1] bg-white text-[#4D453D] hover:border-[#D8BEA2]"
            }`}
          >
            <MoreHorizontal className="h-4 w-4" />
            Más
          </button>
          {moreOpen ? (
            <>
              <div className="fixed inset-0 z-20" role="presentation" onClick={() => setMoreOpen(false)} />
              <div
                role="menu"
                aria-label="Más secciones"
                className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-[#DDD0C1] bg-white p-2 shadow-lg"
              >
                {ADMIN_MORE_NAV.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-[#4D453D] hover:bg-[#F7F1E8]"
                  >
                    <item.icon className="h-4 w-4 text-[#B88B58]" />
                    {item.label}
                  </Link>
                ))}
                {isOwner ? (
                  <Link href="/admin/usuarios" role="menuitem" onClick={() => setMoreOpen(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-[#4D453D] hover:bg-[#F7F1E8]">
                    <UsersRound className="h-4 w-4 text-[#B88B58]" /> Usuarios
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </nav>

      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-[#DDD0C1] bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {ADMIN_PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                active ? "text-[#8A6036]" : "text-[#6B6258]"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
            isMoreActive(pathname, isOwner) ? "text-[#8A6036]" : "text-[#6B6258]"
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          Más
        </button>
      </nav>

      {moreOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-[#191714]/40 sm:hidden"
          role="presentation"
          onClick={() => setMoreOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Más secciones"
            className="w-full rounded-t-2xl bg-white p-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#191714]">Más</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Cerrar"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#DDD0C1]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ADMIN_MORE_NAV.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-[#DDD0C1] px-3 py-3 text-center text-xs font-semibold text-[#4D453D]"
                >
                  <item.icon className="h-5 w-5 text-[#B88B58]" />
                  {item.label}
                </Link>
              ))}
              {isOwner ? (
                <Link href="/admin/usuarios" onClick={() => setMoreOpen(false)} className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-[#DDD0C1] px-3 py-3 text-center text-xs font-semibold text-[#4D453D]">
                  <UsersRound className="h-5 w-5 text-[#B88B58]" /> Usuarios
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
