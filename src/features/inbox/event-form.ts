import { z } from "zod";

import { currencySchema, moneySchema, parsedOrderItemSchema } from "@/types/domain";
import { parseShanghaiDateTimeInput } from "@/lib/date-time";

const headerSchema = z.object({
  externalOrderId: z.string().trim().min(1),
  orderedAt: z.string().trim().min(1),
  currency: z.string().trim().transform((value) => value.toLocaleUpperCase()).pipe(currencySchema),
  total: moneySchema,
  itemCount: z.coerce.number().int().min(1, "订单中至少需要一张唱片").max(100)
});

function optionalUrl(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

export function parseOrderConfirmationForm(formData: FormData) {
  const header = headerSchema.parse({
    externalOrderId: formData.get("externalOrderId"),
    orderedAt: formData.get("orderedAt"),
    currency: formData.get("currency"),
    total: formData.get("total"),
    itemCount: formData.get("itemCount")
  });

  const items = Array.from({ length: header.itemCount }, (_, index) =>
    parsedOrderItemSchema.parse({
      albumTitle: formData.get(`albumTitle.${index}`),
      artistName: formData.get(`artistName.${index}`),
      unitPrice: formData.get(`unitPrice.${index}`),
      quantity: Number(formData.get(`quantity.${index}`) ?? 1),
      imageUrl: optionalUrl(formData.get(`imageUrl.${index}`)),
      productUrl: optionalUrl(formData.get(`productUrl.${index}`))
    })
  );

  return {
    externalOrderId: header.externalOrderId,
    orderedAt: parseShanghaiDateTimeInput(header.orderedAt),
    currency: header.currency,
    total: header.total,
    items
  };
}
