import { createProductoService } from "@/services/productoService";
import { createPedidoService } from "@/services/pedidoService";

export async function getAdminPageData() {
  const pedidoService = createPedidoService();
  const productoService = createProductoService();

  const [dashboard, productos] = await Promise.all([
    pedidoService.obtenerDashboardAdmin(),
    productoService.obtenerCatalogoAdmin()
  ]);

  return { dashboard, productos };
}
