/**
 * Proyecto: Perfume Store
 * Modulo: Repositorio de Clientes
 * Descripcion: Acceso a clientes desde memoria local o Supabase.
 * Buenas practicas: Codigo modular, validado y orientado a mantenibilidad.
 * Seguridad: No incluir claves ni datos sensibles en este archivo.
 */

import { Cliente } from "@/domain/Cliente";
import {
  normalizeCustomerDisplayName,
  normalizeCustomerEmailKey,
  normalizeCustomerPhoneKey,
  normalizeCustomerRutKey
} from "@/lib/customers/identity";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ClienteRepository {
  upsertCliente(cliente: Cliente, preferredId?: string): Promise<{ id: string }>;
  buscarClienteRelacionado(cliente: Cliente): Promise<{ id: string } | null>;
  actualizarCliente(cliente: Cliente): Promise<{ id: string }>;
}

type IdentityFields = {
  telefono: string;
  rut: string;
  email: string;
  nombre: string;
};

/**
 * Coincide por telefono, RUT o correo, en ese orden de confianza. El nombre
 * nunca es suficiente por si solo para considerar dos clientes como el mismo.
 */
function matchesCustomerIdentity(current: IdentityFields, candidate: IdentityFields) {
  const currentPhone = normalizeCustomerPhoneKey(current.telefono);
  const candidatePhone = normalizeCustomerPhoneKey(candidate.telefono);

  if (currentPhone && candidatePhone && currentPhone === candidatePhone) {
    return true;
  }

  const currentRut = normalizeCustomerRutKey(current.rut);
  const candidateRut = normalizeCustomerRutKey(candidate.rut);

  if (currentRut && candidateRut && currentRut === candidateRut) {
    return true;
  }

  const currentEmail = normalizeCustomerEmailKey(current.email);
  const candidateEmail = normalizeCustomerEmailKey(candidate.email);

  if (currentEmail && candidateEmail && currentEmail === candidateEmail) {
    return true;
  }

  return false;
}

function identityScore(fields: IdentityFields) {
  return (
    Number(Boolean(normalizeCustomerPhoneKey(fields.telefono))) * 4 +
    Number(Boolean(normalizeCustomerRutKey(fields.rut))) * 3 +
    Number(Boolean(normalizeCustomerEmailKey(fields.email))) * 2 +
    Number(Boolean(fields.nombre.trim())) * 1
  );
}

function normalizeClienteInput(cliente: Cliente) {
  return new Cliente({
    id: cliente.id,
    nombre: normalizeCustomerDisplayName(cliente.nombre),
    rut: cliente.rut,
    email: cliente.email,
    telefono: cliente.telefono,
    region: cliente.region,
    comuna: cliente.comuna,
    direccion: cliente.direccion,
    referenciaDireccion: cliente.referenciaDireccion,
    lugarTrabajo: cliente.lugarTrabajo
  });
}

type StoredCustomer = {
  id: string;
  nombre: string;
  rut?: string;
  email?: string;
  telefono: string;
  region?: string;
  comuna?: string;
  direccion?: string;
  referenciaDireccion?: string;
  lugarTrabajo: string;
};

class MemoryClienteRepository implements ClienteRepository {
  async buscarClienteRelacionado(cliente: Cliente) {
    const normalizedCliente = normalizeClienteInput(cliente);
    const candidates = localStore.customers.filter((item) =>
      matchesCustomerIdentity(toIdentityFields(item), toIdentityFields(normalizedCliente))
    );

    if (candidates.length === 0) {
      return null;
    }

    const best = candidates.reduce((currentBest, candidate) =>
      identityScore(toIdentityFields(candidate)) > identityScore(toIdentityFields(currentBest))
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
        applyClienteFields(existingById, normalizedCliente);
        return { id: existingById.id };
      }
    }

    const existing = localStore.customers.find((item) =>
      matchesCustomerIdentity(toIdentityFields(item), toIdentityFields(normalizedCliente))
    );

    if (existing) {
      applyClienteFields(existing, normalizedCliente);
      return { id: existing.id };
    }

    const id = crypto.randomUUID();
    localStore.customers.push({
      id,
      nombre: normalizedCliente.nombre,
      rut: normalizedCliente.rut,
      email: normalizedCliente.email,
      telefono: normalizedCliente.telefono,
      region: normalizedCliente.region,
      comuna: normalizedCliente.comuna,
      direccion: normalizedCliente.direccion,
      referenciaDireccion: normalizedCliente.referenciaDireccion,
      lugarTrabajo: normalizedCliente.lugarTrabajo,
      createdAt: new Date().toISOString()
    });

    return { id };
  }

  async actualizarCliente(cliente: Cliente) {
    if (!cliente.id) {
      throw new Error("El cliente a editar no es valido.");
    }

    const normalizedCliente = normalizeClienteInput(cliente);
    const existing = localStore.customers.find((item) => item.id === normalizedCliente.id);

    if (!existing) {
      throw new Error("Cliente no encontrado.");
    }

    const conflict = localStore.customers.some(
      (item) =>
        item.id !== normalizedCliente.id &&
        matchesCustomerIdentity(toIdentityFields(item), toIdentityFields(normalizedCliente))
    );

    if (conflict) {
      throw new Error("Ya existe otro cliente con ese telefono, RUT o correo.");
    }

    applyClienteFields(existing, normalizedCliente);
    return { id: existing.id };
  }
}

function toIdentityFields(value: StoredCustomer | Cliente): IdentityFields {
  if (value instanceof Cliente) {
    return {
      telefono: value.telefono,
      rut: value.rut,
      email: value.email,
      nombre: value.nombre
    };
  }

  return {
    telefono: value.telefono,
    rut: value.rut ?? "",
    email: value.email ?? "",
    nombre: value.nombre
  };
}

function applyClienteFields(target: StoredCustomer, source: Cliente) {
  target.nombre = source.nombre;
  target.rut = source.rut;
  target.email = source.email;
  target.telefono = source.telefono;
  target.region = source.region;
  target.comuna = source.comuna;
  target.direccion = source.direccion;
  target.referenciaDireccion = source.referenciaDireccion;
  target.lugarTrabajo = source.lugarTrabajo;
}

type SupabaseClienteRow = {
  id: string;
  nombre: string;
  rut: string | null;
  email: string | null;
  telefono: string | null;
  region: string | null;
  comuna: string | null;
  direccion: string | null;
  referencia_direccion: string | null;
  lugar_trabajo: string | null;
};

function buildClientePayload(cliente: Cliente) {
  return {
    nombre: cliente.nombre,
    rut: cliente.rut || null,
    email: cliente.email || null,
    telefono: cliente.telefono || null,
    region: cliente.region || null,
    comuna: cliente.comuna || null,
    direccion: cliente.direccion || null,
    referencia_direccion: cliente.referenciaDireccion || null,
    lugar_trabajo: cliente.lugarTrabajo || null
  };
}

function rowToIdentityFields(row: SupabaseClienteRow): IdentityFields {
  return {
    telefono: row.telefono ?? "",
    rut: row.rut ?? "",
    email: row.email ?? "",
    nombre: row.nombre ?? ""
  };
}

class SupabaseClienteRepository implements ClienteRepository {
  async buscarClienteRelacionado(cliente: Cliente) {
    const supabase = createSupabaseServerClient();
    const normalizedCliente = normalizeClienteInput(cliente);
    const orFilters: string[] = [];

    if (normalizedCliente.telefono) {
      orFilters.push(`telefono.eq.${normalizedCliente.telefono}`);
    }

    if (normalizedCliente.rut) {
      orFilters.push(`rut.eq.${normalizedCliente.rut}`);
    }

    if (normalizedCliente.email) {
      orFilters.push(`email.eq.${normalizedCliente.email}`);
    }

    if (orFilters.length === 0) {
      return null;
    }

    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre, rut, email, telefono, region, comuna, direccion, referencia_direccion, lugar_trabajo")
      .or(orFilters.join(","))
      .limit(20);

    if (error) {
      throw new Error("No fue posible consultar el cliente.");
    }

    const candidates = (data ?? []) as SupabaseClienteRow[];

    if (candidates.length === 0) {
      return null;
    }

    const best = candidates.reduce((currentBest, candidate) =>
      identityScore(rowToIdentityFields(candidate)) >
      identityScore(rowToIdentityFields(currentBest))
        ? candidate
        : currentBest
    );

    return { id: best.id };
  }

  async upsertCliente(cliente: Cliente, preferredId?: string) {
    const supabase = createSupabaseServerClient();
    const normalizedCliente = normalizeClienteInput(cliente);
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

    if (!existingId) {
      const related = await this.buscarClienteRelacionado(normalizedCliente);
      existingId = related?.id;
    }

    const payload = buildClientePayload(normalizedCliente);

    if (existingId) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", existingId);

      if (error) {
        throw new Error("No fue posible actualizar el cliente.");
      }

      return { id: existingId };
    }

    const { data, error } = await supabase
      .from("clientes")
      .insert(payload)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error("No fue posible registrar el cliente.");
    }

    return { id: data.id };
  }

  async actualizarCliente(cliente: Cliente) {
    if (!cliente.id) {
      throw new Error("El cliente a editar no es valido.");
    }

    const customerId = cliente.id;
    const supabase = createSupabaseServerClient();
    const normalizedCliente = normalizeClienteInput(cliente);

    const { data: existingById, error: existingByIdError } = await supabase
      .from("clientes")
      .select("id")
      .eq("id", customerId)
      .limit(1);

    if (existingByIdError) {
      throw new Error("No fue posible consultar el cliente.");
    }

    if (!existingById?.[0]?.id) {
      throw new Error("Cliente no encontrado.");
    }

    const related = await this.buscarClienteRelacionado(normalizedCliente);

    if (related && related.id !== customerId) {
      throw new Error("Ya existe otro cliente con ese telefono, RUT o correo.");
    }

    const { error } = await supabase
      .from("clientes")
      .update(buildClientePayload(normalizedCliente))
      .eq("id", customerId);

    if (error) {
      throw new Error("No fue posible actualizar el cliente.");
    }

    return { id: customerId };
  }
}

export function getClienteRepository(): ClienteRepository {
  if (isSupabaseConfigured()) {
    return new SupabaseClienteRepository();
  }

  return new MemoryClienteRepository();
}

// Exportado para pruebas de identidad de clientes.
export const __testables = {
  matchesCustomerIdentity,
  identityScore,
  toIdentityFields
};
