/**
 * Proyecto: Pauli Store
 * Modulo: Repositorio de Clientes
 * Descripcion: Acceso a clientes desde memoria local o Supabase.
 * Autor: Equipo Pauli Store
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Cliente } from "@/domain/Cliente";
import {
  isWeakCustomerWorkplaceName,
  normalizeCustomerDisplayName,
  normalizeCustomerLookupValue
} from "@/lib/customers/identity";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ClienteRepository {
  upsertCliente(cliente: Cliente, preferredId?: string): Promise<{ id: string }>;
  buscarClienteRelacionado(cliente: Cliente): Promise<{ id: string } | null>;
}

function hasStrongerCustomerData(
  current: { telefono: string; lugarTrabajo: string },
  candidate: { telefono: string; lugarTrabajo: string }
) {
  const currentScore =
    Number(Boolean(current.telefono)) * 4 +
    Number(Boolean(current.lugarTrabajo && !isWeakCustomerWorkplaceName(current.lugarTrabajo))) * 2 +
    Number(Boolean(current.lugarTrabajo));
  const candidateScore =
    Number(Boolean(candidate.telefono)) * 4 +
    Number(Boolean(candidate.lugarTrabajo && !isWeakCustomerWorkplaceName(candidate.lugarTrabajo))) * 2 +
    Number(Boolean(candidate.lugarTrabajo));

  return candidateScore > currentScore;
}

function normalizeIdentityText(value: string) {
  return normalizeCustomerLookupValue(value);
}

function matchesCustomerIdentity(
  current: { telefono: string; nombre: string; lugarTrabajo: string },
  cliente: Cliente
) {
  const normalizedCustomerName = normalizeCustomerDisplayName(cliente.nombre);

  if (current.telefono && current.telefono === cliente.telefono) {
    return true;
  }

  return (
    normalizeIdentityText(normalizeCustomerDisplayName(current.nombre)) ===
      normalizeIdentityText(normalizedCustomerName) &&
    normalizeIdentityText(current.lugarTrabajo) ===
      normalizeIdentityText(cliente.lugarTrabajo)
  );
}

function normalizeClienteInput(cliente: Cliente) {
  return new Cliente({
    id: cliente.id,
    nombre: normalizeCustomerDisplayName(cliente.nombre),
    telefono: cliente.telefono,
    lugarTrabajo: cliente.lugarTrabajo
  });
}

class MemoryClienteRepository implements ClienteRepository {
  async buscarClienteRelacionado(cliente: Cliente) {
    const normalizedCliente = normalizeClienteInput(cliente);
    const exactByPhone = cliente.telefono
      ? localStore.customers.find((item) => item.telefono === cliente.telefono)
      : null;

    if (exactByPhone) {
      return { id: exactByPhone.id };
    }

    const candidates = localStore.customers.filter(
      (item) =>
        normalizeIdentityText(normalizeCustomerDisplayName(item.nombre)) ===
        normalizeIdentityText(normalizedCliente.nombre)
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
    const normalizedCliente = normalizeClienteInput(cliente);
    if (preferredId) {
      const existingById = localStore.customers.find((item) => item.id === preferredId);

      if (existingById) {
        existingById.nombre = normalizedCliente.nombre;
        existingById.telefono = normalizedCliente.telefono;
        existingById.lugarTrabajo = normalizedCliente.lugarTrabajo;
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
          normalizedCliente
        )
    );

    if (existing) {
      existing.nombre = normalizedCliente.nombre;
      existing.telefono = normalizedCliente.telefono;
      existing.lugarTrabajo = normalizedCliente.lugarTrabajo;
      return { id: existing.id };
    }

    const id = crypto.randomUUID();
    localStore.customers.push({
      id,
      nombre: normalizedCliente.nombre,
      telefono: normalizedCliente.telefono,
      lugarTrabajo: normalizedCliente.lugarTrabajo,
      createdAt: new Date().toISOString()
    });

    return { id };
  }
}

class SupabaseClienteRepository implements ClienteRepository {
  async buscarClienteRelacionado(cliente: Cliente) {
    const normalizedCliente = normalizeClienteInput(cliente);
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
        normalizeIdentityText(normalizeCustomerDisplayName(item.nombre ?? "")) ===
        normalizeIdentityText(normalizedCliente.nombre)
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
    const normalizedCliente = normalizeClienteInput(cliente);
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

    if (!existingId && normalizedCliente.telefono) {
      const { data: existingByPhone, error: existingError } = await supabase
        .from("clientes")
        .select("id, nombre, lugar_trabajo, telefono")
        .eq("telefono", normalizedCliente.telefono)
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
          normalizedCliente
        )
      );

      existingId = fallbackMatch?.id;
    }

    if (existingId) {
      const { error } = await supabase
        .from("clientes")
        .update({
          nombre: normalizedCliente.nombre,
          telefono: normalizedCliente.telefono || null,
          lugar_trabajo: normalizedCliente.lugarTrabajo
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
        nombre: normalizedCliente.nombre,
        telefono: normalizedCliente.telefono || null,
        lugar_trabajo: normalizedCliente.lugarTrabajo
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
