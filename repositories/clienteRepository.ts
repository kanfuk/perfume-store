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
  upsertCliente(cliente: Cliente): Promise<{ id: string }>;
}

class MemoryClienteRepository implements ClienteRepository {
  async upsertCliente(cliente: Cliente) {
    const existing = localStore.customers.find(
      (item) => item.telefono === cliente.telefono
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
  async upsertCliente(cliente: Cliente) {
    const supabase = createSupabaseServerClient();
    const { data: existing, error: existingError } = await supabase
      .from("clientes")
      .select("id")
      .eq("telefono", cliente.telefono)
      .limit(1);

    if (existingError) {
      throw new Error("No fue posible consultar el cliente.");
    }

    const existingId = existing?.[0]?.id;

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
