import { describe, expect, it, vi } from "vitest";

/**
 * Hotfix integridad de identidad: verifica, del lado Supabase (la
 * implementacion que corre en produccion), que buscarPedidosPorEstado
 * prefiere las columnas *_snapshot de public.pedidos por sobre la ficha
 * cliente "viva" (join clientes:cliente_id), y que solo cae de vuelta a la
 * ficha viva cuando el snapshot es null (pedidos legacy anteriores al
 * hotfix). Todos los datos son ficticios.
 */

let mockRows: unknown[] = [];

vi.mock("@/lib/env", () => ({
  isSupabaseConfigured: () => true
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table === "pedidos") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: mockRows, error: null })
            })
          })
        };
      }

      throw new Error(`Tabla inesperada en el test: ${table}`);
    }
  })
}));

import { getPedidoRepository } from "@/repositories/pedidoRepository";

function buildRow(overrides: {
  snapshot: {
    nombre: string | null;
    rut: string | null;
    email: string | null;
    telefono: string | null;
    region: string | null;
    comuna: string | null;
    direccion: string | null;
  };
  vivo: {
    nombre: string;
    rut: string;
    email: string;
    telefono: string;
    region: string;
    comuna: string;
    direccion: string;
  };
}) {
  return {
    id: "pedido-snapshot-test-1",
    codigo: "PERF-TEST-000001",
    cliente_id: "cliente-snapshot-test-1",
    estado_pedido: "NUEVO",
    estado_pago: "SIN_PAGO",
    metodo_despacho: "STARKEN_POR_PAGAR",
    costo_despacho: 0,
    admin_seen: false,
    admin_seen_at: null,
    total: 10000,
    subtotal: 10000,
    fecha_pedido: "2026-01-01T00:00:00.000Z",
    origen_pedido: "PUBLICO",
    observacion: null,
    fecha_agendado: null,
    fecha_pago: null,
    fecha_preparacion: null,
    fecha_despacho: null,
    fecha_entrega: null,
    fecha_cancelacion: null,
    motivo_cancelacion: null,
    stock_repuesto: false,
    cliente_nombre_snapshot: overrides.snapshot.nombre,
    cliente_rut_snapshot: overrides.snapshot.rut,
    cliente_email_snapshot: overrides.snapshot.email,
    cliente_telefono_snapshot: overrides.snapshot.telefono,
    cliente_region_snapshot: overrides.snapshot.region,
    cliente_comuna_snapshot: overrides.snapshot.comuna,
    cliente_direccion_snapshot: overrides.snapshot.direccion,
    clientes: {
      nombre: overrides.vivo.nombre,
      telefono: overrides.vivo.telefono,
      lugar_trabajo: "",
      rut: overrides.vivo.rut,
      email: overrides.vivo.email,
      region: overrides.vivo.region,
      comuna: overrides.vivo.comuna,
      direccion: overrides.vivo.direccion
    },
    pedido_items: [
      {
        cantidad: 1,
        precio_unitario: 10000,
        subtotal: 10000,
        producto_id: "producto-snapshot-test-1",
        producto_nombre: "Producto de prueba",
        costo_unitario: 4000,
        total_costo: 4000,
        utilidad_bruta: 6000
      }
    ]
  };
}

const VIVO_MODIFICADO = {
  nombre: "Nombre Vivo Modificado",
  rut: "99.999.999-9",
  email: "vivo@example.com",
  telefono: "+56999999999",
  region: "Región Vivo",
  comuna: "Comuna Vivo",
  direccion: "Dirección Vivo 1"
};

describe("SupabasePedidoRepository.buscarPedidosPorEstado - snapshot-first", () => {
  it("usa el snapshot del pedido aunque la ficha cliente viva sea distinta", async () => {
    mockRows = [
      buildRow({
        snapshot: {
          nombre: "Nombre Snapshot Original",
          rut: "11.111.111-1",
          email: "snapshot@example.com",
          telefono: "+56911111111",
          region: "Región Snapshot",
          comuna: "Comuna Snapshot",
          direccion: "Dirección Snapshot 1"
        },
        vivo: VIVO_MODIFICADO
      })
    ];

    const repository = getPedidoRepository();
    const [pedido] = await repository.buscarPedidosPorEstado("NUEVO");

    expect(pedido.clienteNombre).toBe("Nombre Snapshot Original");
    expect(pedido.clienteRut).toBe("11.111.111-1");
    expect(pedido.clienteEmail).toBe("snapshot@example.com");
    expect(pedido.clienteTelefono).toBe("+56911111111");
    expect(pedido.clienteRegion).toBe("Región Snapshot");
    expect(pedido.clienteComuna).toBe("Comuna Snapshot");
    expect(pedido.clienteDireccion).toBe("Dirección Snapshot 1");
  });

  it("cae a la ficha cliente viva solo cuando el snapshot es null (pedido legacy anterior al hotfix)", async () => {
    mockRows = [
      buildRow({
        snapshot: {
          nombre: null,
          rut: null,
          email: null,
          telefono: null,
          region: null,
          comuna: null,
          direccion: null
        },
        vivo: VIVO_MODIFICADO
      })
    ];

    const repository = getPedidoRepository();
    const [pedido] = await repository.buscarPedidosPorEstado("NUEVO");

    expect(pedido.clienteNombre).toBe(VIVO_MODIFICADO.nombre);
    expect(pedido.clienteRut).toBe(VIVO_MODIFICADO.rut);
    expect(pedido.clienteEmail).toBe(VIVO_MODIFICADO.email);
    expect(pedido.clienteTelefono).toBe(VIVO_MODIFICADO.telefono);
    expect(pedido.clienteRegion).toBe(VIVO_MODIFICADO.region);
    expect(pedido.clienteComuna).toBe(VIVO_MODIFICADO.comuna);
    expect(pedido.clienteDireccion).toBe(VIVO_MODIFICADO.direccion);
  });
});
