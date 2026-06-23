-- ============================================================
-- Limpieza controlada de datos de prueba - Pauli Store
-- Elimina solo datos transaccionales de prueba.
-- Mantiene productos, stock_actual y stock_agenda intactos.
--
-- IMPORTANTE:
-- Ejecutar manualmente solo en desarrollo o con respaldo previo.
-- Este script elimina clientes, pedidos, pagos, fiados y pedido_items.
-- ============================================================

BEGIN;

-- Orden seguro por dependencias sin tocar productos ni stock.
DELETE FROM pedido_items;
DELETE FROM pagos;
DELETE FROM fiados;
DELETE FROM pedidos;
DELETE FROM clientes;

COMMIT;
