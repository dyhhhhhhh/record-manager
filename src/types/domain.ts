import { z } from "zod";

export const fulfillmentStatusSchema = z.enum(["ordered", "shipped", "received"]);
export const mailEventTypeSchema = z.enum(["order_confirmation", "shipment", "cancellation"]);
export const mailEventStatusSchema = z.enum(["pending", "applied", "ignored", "failed"]);

export const moneySchema = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "金额必须是非负十进制字符串");
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "币种必须是三位 ISO 代码");

export const parsedOrderItemSchema = z.object({
  albumTitle: z.string().trim().min(1),
  artistName: z.string().trim().min(1),
  unitPrice: moneySchema,
  quantity: z.int().positive(),
  imageUrl: z.url().optional(),
  productUrl: z.url().optional()
});

const eventBaseSchema = z.object({
  externalOrderId: z.string().trim().min(1),
  occurredAt: z.iso.datetime()
});

export const orderConfirmationPayloadSchema = eventBaseSchema.extend({
  type: z.literal("order_confirmation"),
  currency: currencySchema,
  total: moneySchema,
  items: z.array(parsedOrderItemSchema).min(1)
});

export const shipmentPayloadSchema = eventBaseSchema.extend({
  type: z.literal("shipment"),
  itemHints: z.array(z.string().trim().min(1)).default([])
});

export const cancellationPayloadSchema = eventBaseSchema.extend({
  type: z.literal("cancellation"),
  itemHints: z.array(z.string().trim().min(1)).default([])
});

export const mailEventPayloadSchema = z.discriminatedUnion("type", [
  orderConfirmationPayloadSchema,
  shipmentPayloadSchema,
  cancellationPayloadSchema
]);

export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;
export type MailEventType = z.infer<typeof mailEventTypeSchema>;
export type MailEventStatus = z.infer<typeof mailEventStatusSchema>;
export type ParsedOrderItem = z.infer<typeof parsedOrderItemSchema>;
export type MailEventPayload = z.infer<typeof mailEventPayloadSchema>;
export type OrderConfirmationPayload = z.infer<typeof orderConfirmationPayloadSchema>;
export type ShipmentPayload = z.infer<typeof shipmentPayloadSchema>;
export type CancellationPayload = z.infer<typeof cancellationPayloadSchema>;

export interface OrderRecord {
  id: string;
  externalOrderId: string;
  orderedAt: string;
  currency: string;
  originalTotal: string;
  effectiveTotal: string;
  fulfillmentStatus: FulfillmentStatus;
  cancelledAt: string | null;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  albumTitle: string;
  artistName: string;
  unitPrice: string;
  quantity: number;
  imagePath: string | null;
  cancelledAt: string | null;
}
