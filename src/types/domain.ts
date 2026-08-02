import { z } from "zod";

export const merchantSchema = z.enum(["imusic", "hmv", "mutant", "black_screen", "laced"]);
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
  merchant: merchantSchema.default("imusic"),
  externalOrderId: z.string().trim().min(1),
  occurredAt: z.iso.datetime()
});

type AccountingInput = {
  itemsSubtotal: string;
  shippingTotal: string;
  discountTotal: string;
  total: string;
  items?: Array<{ unitPrice: string; quantity: number }>;
};

function toMinorUnits(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

export function orderAccountingErrors(input: AccountingInput, totalLabel = "订单实付") {
  const errors: string[] = [];
  const itemsSubtotal = toMinorUnits(input.itemsSubtotal);

  if (input.items) {
    const itemTotal = input.items.reduce(
      (sum, item) => sum + toMinorUnits(item.unitPrice) * BigInt(item.quantity),
      0n
    );
    if (itemTotal !== itemsSubtotal) {
      errors.push("商品原价必须等于商品单价与数量合计");
    }
  }

  const payable = itemsSubtotal + toMinorUnits(input.shippingTotal) - toMinorUnits(input.discountTotal);
  if (payable !== toMinorUnits(input.total)) {
    errors.push(`${totalLabel}必须等于商品原价加运费再减优惠`);
  }
  return errors;
}

export const orderConfirmationPayloadSchema = eventBaseSchema.extend({
  type: z.literal("order_confirmation"),
  currency: currencySchema,
  itemsSubtotal: moneySchema,
  shippingTotal: moneySchema,
  shippingMethod: z.string().trim().min(1),
  discountTotal: moneySchema.default("0"),
  taxTotal: moneySchema,
  total: moneySchema,
  items: z.array(parsedOrderItemSchema).min(1)
}).superRefine((value, context) => {
  for (const message of orderAccountingErrors(value)) {
    context.addIssue({ code: "custom", message });
  }
});

export const shipmentPayloadSchema = eventBaseSchema.extend({
  type: z.literal("shipment"),
  itemHints: z.array(z.string().trim().min(1)).default([]),
  items: z.array(parsedOrderItemSchema).default([])
});

export const cancellationPayloadSchema = eventBaseSchema.extend({
  type: z.literal("cancellation"),
  itemHints: z.array(z.string().trim().min(1)).default([]),
  items: z.array(parsedOrderItemSchema).default([])
});

export const mailEventPayloadSchema = z.discriminatedUnion("type", [
  orderConfirmationPayloadSchema,
  shipmentPayloadSchema,
  cancellationPayloadSchema
]);

export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;
export type Merchant = z.infer<typeof merchantSchema>;
export type MailEventType = z.infer<typeof mailEventTypeSchema>;
export type MailEventStatus = z.infer<typeof mailEventStatusSchema>;
export type ParsedOrderItem = z.infer<typeof parsedOrderItemSchema>;
export type MailEventPayload = z.infer<typeof mailEventPayloadSchema>;
export type OrderConfirmationPayload = z.infer<typeof orderConfirmationPayloadSchema>;
export type ShipmentPayload = z.infer<typeof shipmentPayloadSchema>;
export type CancellationPayload = z.infer<typeof cancellationPayloadSchema>;

export interface OrderRecord {
  id: string;
  merchant: Merchant;
  externalOrderId: string;
  orderedAt: string;
  currency: string;
  itemsSubtotal: string;
  shippingTotal: string;
  shippingMethod: string | null;
  discountTotal: string;
  taxTotal: string;
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
