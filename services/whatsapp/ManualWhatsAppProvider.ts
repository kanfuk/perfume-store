import { normalizeChilePhone } from "@/lib/phone/normalizeChilePhone";
import {
  buildOrderConfirmationMessage,
  type BuildOrderConfirmationMessageInput
} from "@/lib/whatsapp/buildOrderConfirmationMessage";
import { buildWhatsAppManualUrl } from "@/lib/whatsapp/buildWhatsAppManualUrl";
import type {
  OrderNotificationData,
  WhatsAppNotificationProvider,
  WhatsAppNotificationResult
} from "@/services/NotificationService";

function buildMessageInput(data: OrderNotificationData): BuildOrderConfirmationMessageInput {
  return {
    customerName: data.customerName,
    items: data.items,
    total: data.total,
    deliveryDateLabel: data.deliveryDateLabel
  };
}

export class ManualWhatsAppProvider implements WhatsAppNotificationProvider {
  createOrderConfirmation(data: OrderNotificationData): WhatsAppNotificationResult {
    const rawPhone = data.customerPhone?.trim();

    if (!rawPhone) {
      return {
        mode: "manual",
        status: "unavailable",
        error: "Sin telefono"
      };
    }

    const normalizedPhone = normalizeChilePhone(rawPhone);

    if (!normalizedPhone) {
      return {
        mode: "manual",
        status: "unavailable",
        error: "Telefono invalido"
      };
    }

    const message = buildOrderConfirmationMessage(buildMessageInput(data));

    return {
      mode: "manual",
      status: "ready",
      url: buildWhatsAppManualUrl(normalizedPhone, message),
      message
    };
  }
}
