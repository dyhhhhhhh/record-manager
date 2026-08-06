import { z } from "zod";

import { parseShanghaiDateTimeInput } from "@/lib/date-time";
import { currencySchema, moneySchema, orderAccountingErrors, parsedOrderItemSchema } from "@/types/domain";

const headerSchema = z.object({
  externalOrderId: z.string().trim().min(1),
  orderedAt: z.string().trim().min(1),
  currency: z.string().trim().transform((value) => value.toLocaleUpperCase()).pipe(currencySchema),
  itemsSubtotal: moneySchema,
  shippingTotal: moneySchema,
  additionalFeeTotal: moneySchema,
  shippingMethod: z.string().trim().min(1),
  discountTotal: moneySchema,
  taxTotal: moneySchema,
  total: moneySchema,
  itemCount: z.coerce.number().int().min(1, "订单中至少需要一张唱片").max(100)
});

function optionalString(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

export function parseOrderConfirmationForm(formData: FormData) {
  const header = headerSchema.parse({
    externalOrderId: formData.get("externalOrderId"),
    orderedAt: formData.get("orderedAt"),
    currency: formData.get("currency"),
    itemsSubtotal: formData.get("itemsSubtotal"),
    shippingTotal: formData.get("shippingTotal"),
    additionalFeeTotal: formData.get("additionalFeeTotal") ?? "0",
    shippingMethod: formData.get("shippingMethod"),
    discountTotal: formData.get("discountTotal"),
    taxTotal: formData.get("taxTotal"),
    total: formData.get("total"),
    itemCount: formData.get("itemCount")
  });

  const items = Array.from({ length: header.itemCount }, (_, index) =>
    parsedOrderItemSchema.parse({
      albumTitle: formData.get(`albumTitle.${index}`),
      artistName: formData.get(`artistName.${index}`),
      unitPrice: formData.get(`unitPrice.${index}`),
      quantity: Number(formData.get(`quantity.${index}`) ?? 1),
      imageUrl: optionalString(formData.get(`imageUrl.${index}`)),
      productUrl: optionalString(formData.get(`productUrl.${index}`)),
      merchantItemId: optionalString(formData.get(`merchantItemId.${index}`))
    })
  );

  const result = {
    externalOrderId: header.externalOrderId,
    orderedAt: parseShanghaiDateTimeInput(header.orderedAt),
    currency: header.currency,
    itemsSubtotal: header.itemsSubtotal,
    shippingTotal: header.shippingTotal,
    additionalFeeTotal: header.additionalFeeTotal,
    shippingMethod: header.shippingMethod,
    discountTotal: header.discountTotal,
    taxTotal: header.taxTotal,
    total: header.total,
    items
  };
  const accountingError = orderAccountingErrors(result)[0];
  if (accountingError) throw new Error(accountingError);
  return result;
}
