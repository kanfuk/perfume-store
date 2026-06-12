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
  insertarCliente(cliente: Cliente): Promise<{ id: string }>;
}

class MemoryClienteRepository implements ClienteRepository {
  async insertarCliente(cliente: Cliente) {
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
  async insertarCliente(cliente: Cliente) {
    const supabase = createSupabaseServerClient();
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
