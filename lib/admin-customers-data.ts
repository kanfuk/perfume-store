import type { AdminCustomerOption } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/env";
import { localStore } from "@/lib/local-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function sortCustomers(customers: AdminCustomerOption[]) {
  return customers.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function getAdminCustomersData(): Promise<AdminCustomerOption[]> {
  if (!isSupabaseConfigured()) {
    return sortCustomers(
      localStore.customers.map((customer) => ({
        id: customer.id,
        nombre: customer.nombre,
        rut: customer.rut,
        email: customer.email,
        telefono: customer.telefono,
        region: customer.region,
        comuna: customer.comuna,
        direccion: customer.direccion,
        referenciaDireccion: customer.referenciaDireccion,
        lugarTrabajo: customer.lugarTrabajo
      }))
    );
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, telefono, lugar_trabajo, rut, email, region, comuna, direccion, referencia_direccion")
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error("No fue posible obtener los clientes.");
  }

  return sortCustomers(
    (data ?? []).map((customer) => ({
      id: customer.id,
      nombre: customer.nombre ?? "Cliente sin nombre",
      rut: customer.rut ?? undefined,
      email: customer.email ?? undefined,
      telefono: customer.telefono ?? "",
      region: customer.region ?? undefined,
      comuna: customer.comuna ?? undefined,
      direccion: customer.direccion ?? undefined,
      referenciaDireccion: customer.referencia_direccion ?? undefined,
      lugarTrabajo: customer.lugar_trabajo ?? ""
    }))
  );
}
