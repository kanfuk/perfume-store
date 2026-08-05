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
  /** Banlist (Fase 7.5A). */
  buscarClientePorId(id: string): Promise<Cliente | null>;
  /** Escritura parcial: toca UNICAMENTE las columnas de bloqueo, nunca datos personales. */
  actualizarEstadoBloqueo(clienteId: string, cambios: EstadoBloqueoCambios): Promise<Cliente>;
  /**
   * Coincidencia exacta por telefono, luego RUT, luego correo (mismo orden
   * de confianza que matchesCustomerIdentity) SOLO entre clientes con
   * bloqueado = true. Nunca fuzzy, nunca parcial.
   */
  buscarClienteBloqueadoPorIdentidad(identidad: IdentidadPedido): Promise<{ id: string } | null>;
}

export type EstadoBloqueoCambios = {
  bloqueado: boolean;
  motivoBloqueo: string | null;
  bloqueadoEn: Date | null;
  desbloqueadoEn: Date | null;
  bloqueadoPor: string | null;
};

export type IdentidadPedido = {
  telefono?: string;
  rut?: string;
  email?: string;
};

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
  bloqueado?: boolean;
  motivoBloqueo?: string | null;
  bloqueadoEn?: string | null;
  desbloqueadoEn?: string | null;
  bloqueadoPor?: string | null;
};

function storedCustomerToCliente(stored: StoredCustomer): Cliente {
  return new Cliente({
    id: stored.id,
    nombre: stored.nombre,
    rut: stored.rut,
    email: stored.email,
    telefono: stored.telefono,
    region: stored.region,
    comuna: stored.comuna,
    direccion: stored.direccion,
    referenciaDireccion: stored.referenciaDireccion,
    lugarTrabajo: stored.lugarTrabajo,
    bloqueado: stored.bloqueado ?? false,
    motivoBloqueo: stored.motivoBloqueo ?? null,
    bloqueadoEn: stored.bloqueadoEn ? new Date(stored.bloqueadoEn) : null,
    desbloqueadoEn: stored.desbloqueadoEn ? new Date(stored.desbloqueadoEn) : null,
    bloqueadoPor: stored.bloqueadoPor ?? null
  });
}

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

  async buscarClientePorId(id: string) {
    const existing = localStore.customers.find((item) => item.id === id);
    return existing ? storedCustomerToCliente(existing) : null;
  }

  async actualizarEstadoBloqueo(clienteId: string, cambios: EstadoBloqueoCambios) {
    const existing = localStore.customers.find((item) => item.id === clienteId);

    if (!existing) {
      throw new Error("Cliente no encontrado.");
    }

    existing.bloqueado = cambios.bloqueado;
    existing.motivoBloqueo = cambios.motivoBloqueo;
    existing.bloqueadoEn = cambios.bloqueadoEn ? cambios.bloqueadoEn.toISOString() : null;
    existing.desbloqueadoEn = cambios.desbloqueadoEn ? cambios.desbloqueadoEn.toISOString() : null;
    existing.bloqueadoPor = cambios.bloqueadoPor;

    return storedCustomerToCliente(existing);
  }

  async buscarClienteBloqueadoPorIdentidad(identidad: IdentidadPedido) {
    if (identidad.telefono) {
      const match = localStore.customers.find(
        (item) => item.bloqueado && item.telefono === identidad.telefono
      );
      if (match) return { id: match.id };
    }

    if (identidad.rut) {
      const match = localStore.customers.find((item) => item.bloqueado && item.rut === identidad.rut);
      if (match) return { id: match.id };
    }

    if (identidad.email) {
      const match = localStore.customers.find(
        (item) => item.bloqueado && item.email === identidad.email
      );
      if (match) return { id: match.id };
    }

    return null;
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

/** Columnas completas de public.clientes, incluida la banlist (Fase 7.5A). */
const CLIENTE_FULL_COLUMNS =
  "id, nombre, rut, email, telefono, region, comuna, direccion, referencia_direccion, lugar_trabajo, bloqueado, motivo_bloqueo, bloqueado_en, desbloqueado_en, bloqueado_por";

type SupabaseClienteFullRow = SupabaseClienteRow & {
  bloqueado: boolean | null;
  motivo_bloqueo: string | null;
  bloqueado_en: string | null;
  desbloqueado_en: string | null;
  bloqueado_por: string | null;
};

function rowToCliente(row: SupabaseClienteFullRow): Cliente {
  return new Cliente({
    id: row.id,
    nombre: row.nombre,
    rut: row.rut ?? undefined,
    email: row.email ?? undefined,
    telefono: row.telefono ?? undefined,
    region: row.region ?? undefined,
    comuna: row.comuna ?? undefined,
    direccion: row.direccion ?? undefined,
    referenciaDireccion: row.referencia_direccion ?? undefined,
    lugarTrabajo: row.lugar_trabajo ?? undefined,
    bloqueado: row.bloqueado ?? false,
    motivoBloqueo: row.motivo_bloqueo ?? null,
    bloqueadoEn: row.bloqueado_en ? new Date(row.bloqueado_en) : null,
    desbloqueadoEn: row.desbloqueado_en ? new Date(row.desbloqueado_en) : null,
    bloqueadoPor: row.bloqueado_por ?? null
  });
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

  async buscarClientePorId(id: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clientes")
      .select(CLIENTE_FULL_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error("No fue posible consultar el cliente.");
    }

    return data ? rowToCliente(data as SupabaseClienteFullRow) : null;
  }

  /**
   * Escritura parcial: el payload SOLO contiene las 5 columnas de bloqueo,
   * nunca nombre/rut/email/telefono/direccion -- a diferencia de
   * actualizarCliente (que reescribe la ficha completa), esta operacion no
   * puede pisar accidentalmente un dato personal por una carrera con otra
   * edicion concurrente.
   */
  async actualizarEstadoBloqueo(clienteId: string, cambios: EstadoBloqueoCambios) {
    const supabase = createSupabaseServerClient();
    const payload = {
      bloqueado: cambios.bloqueado,
      motivo_bloqueo: cambios.motivoBloqueo,
      bloqueado_en: cambios.bloqueadoEn ? cambios.bloqueadoEn.toISOString() : null,
      desbloqueado_en: cambios.desbloqueadoEn ? cambios.desbloqueadoEn.toISOString() : null,
      bloqueado_por: cambios.bloqueadoPor
    };

    const { data, error } = await supabase
      .from("clientes")
      .update(payload)
      .eq("id", clienteId)
      .select(CLIENTE_FULL_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error("No fue posible actualizar el estado de bloqueo del cliente.");
    }

    if (!data) {
      throw new Error("Cliente no encontrado.");
    }

    return rowToCliente(data as SupabaseClienteFullRow);
  }

  /**
   * Coincidencia exacta (nunca ilike/or/fuzzy) por telefono, luego RUT,
   * luego correo, solo entre clientes bloqueados. Se detiene en la primera
   * coincidencia (misma prioridad que matchesCustomerIdentity).
   */
  async buscarClienteBloqueadoPorIdentidad(identidad: IdentidadPedido) {
    const supabase = createSupabaseServerClient();

    if (identidad.telefono) {
      const { data, error } = await supabase
        .from("clientes")
        .select("id")
        .eq("telefono", identidad.telefono)
        .eq("bloqueado", true)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error("No fue posible verificar el estado del cliente.");
      }

      if (data) return { id: data.id };
    }

    if (identidad.rut) {
      const { data, error } = await supabase
        .from("clientes")
        .select("id")
        .eq("rut", identidad.rut)
        .eq("bloqueado", true)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error("No fue posible verificar el estado del cliente.");
      }

      if (data) return { id: data.id };
    }

    if (identidad.email) {
      const { data, error } = await supabase
        .from("clientes")
        .select("id")
        .eq("email", identidad.email)
        .eq("bloqueado", true)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error("No fue posible verificar el estado del cliente.");
      }

      if (data) return { id: data.id };
    }

    return null;
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
