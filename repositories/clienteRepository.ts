/**
 * Proyecto: Pauli Store
 * Modulo: Repositorio de Clientes
 * Descripcion: Acceso a clientes desde memoria local o Supabase.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Cliente } from "@/domain/Cliente";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ClienteRepository {
  upsertCliente(cliente: Cliente, preferredId?: string): Promise<{ id: string }>;
  buscarClienteRelacionado(cliente: Cliente): Promise<{ id: string } | null>;
}

function isWeakCustomerWorkplace(value: string) {
  const normalized = normalizeIdentityText(value);

  return (
    normalized === "" ||
    normalized === "venta directa" ||
    normalized === "venta whatsapp manual" ||
    normalized === "pedido personalizado"
  );
}

function hasStrongerCustomerData(
  current: { telefono: string; lugarTrabajo: string },
  candidate: { telefono: string; lugarTrabajo: string }
) {
  const currentScore =
    Number(Boolean(current.telefono)) * 4 +
    Number(Boolean(current.lugarTrabajo && !isWeakCustomerWorkplace(current.lugarTrabajo))) * 2 +
    Number(Boolean(current.lugarTrabajo));
  const candidateScore =
    Number(Boolean(candidate.telefono)) * 4 +
    Number(Boolean(candidate.lugarTrabajo && !isWeakCustomerWorkplace(candidate.lugarTrabajo))) * 2 +
    Number(Boolean(candidate.lugarTrabajo));

  return candidateScore > currentScore;
}

function normalizeIdentityText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function matchesCustomerIdentity(
  current: { telefono: string; nombre: string; lugarTrabajo: string },
  cliente: Cliente
) {
  if (current.telefono && current.telefono === cliente.telefono) {
    return true;
  }

  return (
    normalizeIdentityText(current.nombre) === normalizeIdentityText(cliente.nombre) &&
    normalizeIdentityText(current.lugarTrabajo) ===
      normalizeIdentityText(cliente.lugarTrabajo)
  );
}

class MemoryClienteRepository implements ClienteRepository {
  async buscarClienteRelacionado(cliente: Cliente) {
    const exactByPhone = cliente.telefono
      ? localStore.customers.find((item) => item.telefono === cliente.telefono)
      : null;

    if (exactByPhone) {
      return { id: exactByPhone.id };
    }

    const candidates = localStore.customers.filter(
      (item) => normalizeIdentityText(item.nombre) === normalizeIdentityText(cliente.nombre)
    );

    if (candidates.length === 0) {
      return null;
    }

    const best = candidates.reduce((currentBest, candidate) =>
      hasStrongerCustomerData(
        {
          telefono: currentBest.telefono,
          lugarTrabajo: currentBest.lugarTrabajo
        },
        {
          telefono: candidate.telefono,
          lugarTrabajo: candidate.lugarTrabajo
        }
      )
        ? candidate
        : currentBest
    );

    return { id: best.id };
  }

  async upsertCliente(cliente: Cliente, preferredId?: string) {
    if (preferredId) {
      const existingById = localStore.customers.find((item) => item.id === preferredId);

      if (existingById) {
        existingById.nombre = cliente.nombre;
        existingById.telefono = cliente.telefono;
        existingById.lugarTrabajo = cliente.lugarTrabajo;
        return { id: existingById.id };
      }
    }

    const existing = localStore.customers.find(
      (item) =>
        matchesCustomerIdentity(
          {
            telefono: item.telefono,
            nombre: item.nombre,
            lugarTrabajo: item.lugarTrabajo
          },
          cliente
        )
    );

    if (existing) {
      existing.nombre = cliente.nombre;
      existing.telefono = cliente.telefono;
      existing.lugarTrabajo = cliente.lugarTrabajo;
      return { id: existing.id };
    }

    const id = crypto.randomUUID();
    localStore.customers.push({
      id,
      nombre: cliente.nombre,
      telefono: cliente.telefono,
      lugarTrabajo: cliente.lugarTrabajo,
      createdAt: new Date().toISOString()
    });

    return { id };
  }
}

class SupabaseClienteRepository implements ClienteRepository {
  async buscarClienteRelacionado(cliente: Cliente) {
    const supabase = createSupabaseServerClient();

    if (cliente.telefono) {
      const { data: existingByPhone, error: phoneError } = await supabase
        .from("clientes")
        .select("id")
        .eq("telefono", cliente.telefono)
        .limit(1);

      if (phoneError) {
        throw new Error("No fue posible consultar el cliente.");
      }

      if (existingByPhone?.[0]?.id) {
        return { id: existingByPhone[0].id };
      }
    }

    const { data: matchesByName, error: nameError } = await supabase
      .from("clientes")
      .select("id, nombre, telefono, lugar_trabajo")
      .ilike("nombre", cliente.nombre)
      .limit(20);

    if (nameError) {
      throw new Error("No fue posible consultar el cliente.");
    }

    const candidates = (matchesByName ?? []).filter(
      (item) =>
        normalizeIdentityText(item.nombre ?? "") ===
        normalizeIdentityText(cliente.nombre)
    );

    if (candidates.length === 0) {
      return null;
    }

    const best = candidates.reduce((currentBest, candidate) =>
      hasStrongerCustomerData(
        {
          telefono: currentBest.telefono ?? "",
          lugarTrabajo: currentBest.lugar_trabajo ?? ""
        },
        {
          telefono: candidate.telefono ?? "",
          lugarTrabajo: candidate.lugar_trabajo ?? ""
        }
      )
        ? candidate
        : currentBest
    );

    return best?.id ? { id: best.id } : null;
  }

  async upsertCliente(cliente: Cliente, preferredId?: string) {
    const supabase = createSupabaseServerClient();
    let existingId = preferredId;

    if (existingId) {
      const { data: existingById, error: existingByIdError } = await supabase
        .from("clientes")
        .select("id")
        .eq("id", existingId)
        .limit(1);

      if (existingByIdError) {
        throw new Error("No fue posible consultar el cliente.");
      }

      existingId = existingById?.[0]?.id;
    }

    if (!existingId && cliente.telefono) {
      const { data: existingByPhone, error: existingError } = await supabase
        .from("clientes")
        .select("id, nombre, lugar_trabajo, telefono")
        .eq("telefono", cliente.telefono)
        .limit(1);

      if (existingError) {
        throw new Error("No fue posible consultar el cliente.");
      }

      existingId = existingByPhone?.[0]?.id;
    }

    if (!existingId) {
      const { data: fallbackMatches, error: fallbackError } = await supabase
        .from("clientes")
        .select("id, nombre, lugar_trabajo, telefono")
        .limit(20);

      if (fallbackError) {
        throw new Error("No fue posible consultar el cliente.");
      }

      const fallbackMatch = fallbackMatches?.find((item) =>
        matchesCustomerIdentity(
          {
            telefono: item.telefono ?? "",
            nombre: item.nombre,
            lugarTrabajo: item.lugar_trabajo ?? ""
          },
          cliente
        )
      );

      existingId = fallbackMatch?.id;
    }

    if (existingId) {
      const { error } = await supabase
        .from("clientes")
        .update({
          nombre: cliente.nombre,
          telefono: cliente.telefono || null,
          lugar_trabajo: cliente.lugarTrabajo
        })
        .eq("id", existingId);

      if (error) {
        throw new Error("No fue posible actualizar el cliente.");
      }

      return { id: existingId };
    }

    const { data, error } = await supabase
      .from("clientes")
      .insert({
        nombre: cliente.nombre,
        telefono: cliente.telefono || null,
        lugar_trabajo: cliente.lugarTrabajo
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error("No fue posible registrar el cliente.");
    }

    return { id: data.id };
  }
}

export function getClienteRepository(): ClienteRepository {
  if (isSupabaseConfigured()) {
    return new SupabaseClienteRepository();
  }

  return new MemoryClienteRepository();
}
