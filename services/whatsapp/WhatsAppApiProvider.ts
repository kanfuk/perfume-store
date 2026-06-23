import type {
  OrderNotificationData,
  WhatsAppNotificationProvider,
  WhatsAppNotificationResult
} from "@/services/NotificationService";

export class WhatsAppApiProvider implements WhatsAppNotificationProvider {
  createOrderConfirmation(data: OrderNotificationData): WhatsAppNotificationResult {
    void data;

    return {
      mode: "automatic",
      status: "failed",
      error: "WhatsApp API no esta configurado todavia."
    };
  }
}
