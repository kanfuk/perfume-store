import type { MetodoDespacho } from "@/lib/constants";
import { ManualWhatsAppProvider } from "@/services/whatsapp/ManualWhatsAppProvider";
import { WhatsAppApiProvider } from "@/services/whatsapp/WhatsAppApiProvider";

export interface OrderNotificationData {
  customerName?: string;
  customerPhone?: string;
  codigo?: string;
  items: Array<{
    name: string;
    quantity: number;
  }>;
  subtotal?: number;
  costoDespacho?: number;
  total?: number;
  metodoDespacho?: MetodoDespacho;
  direccion?: string;
}

export interface WhatsAppNotificationResult {
  mode: "manual" | "automatic";
  status: "ready" | "sent" | "failed" | "unavailable";
  url?: string;
  message?: string;
  error?: string;
}

export interface WhatsAppNotificationProvider {
  createOrderConfirmation(data: OrderNotificationData): WhatsAppNotificationResult;
}

export class NotificationService {
  constructor(private readonly provider: WhatsAppNotificationProvider) {}

  prepareOrderConfirmationNotification(data: OrderNotificationData) {
    return this.provider.createOrderConfirmation(data);
  }
}

export function createNotificationService() {
  const mode = process.env.WHATSAPP_MODE?.trim().toLowerCase() || "manual";

  if (mode === "automatic") {
    return new NotificationService(new WhatsAppApiProvider());
  }

  return new NotificationService(new ManualWhatsAppProvider());
}
