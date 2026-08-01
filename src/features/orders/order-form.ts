import { z } from "zod";

import { parseShanghaiDateTimeInput } from "@/lib/date-time";
import { currencySchema, moneySchema } from "@/types/domain";

const orderEditSchema = z.object({
  externalOrderId: z.string().trim().min(1),
  orderedAt: z.string().trim().min(1),
  currency: z.string().trim().transform((value) => value.toLocaleUpperCase()).pipe(currencySchema),
  itemsSubtotal: moneySchema,
  shippingTotal: moneySchema,
  shippingMethod: z.string().trim().transform((value) => value || null),
  taxTotal: moneySchema,
  originalTotal: moneySchema,
  effectiveTotal: moneySchema
});

export function parseOrderEditForm(formData: FormData) {
  const values = orderEditSchema.parse({
    externalOrderId: formData.get("externalOrderId"),
    orderedAt: formData.get("orderedAt"),
    currency: formData.get("currency"),
    itemsSubtotal: formData.get("itemsSubtotal"),
    shippingTotal: formData.get("shippingTotal"),
    shippingMethod: formData.get("shippingMethod"),
    taxTotal: formData.get("taxTotal"),
    originalTotal: formData.get("originalTotal"),
    effectiveTotal: formData.get("effectiveTotal")
  });

  return { ...values, orderedAt: parseShanghaiDateTimeInput(values.orderedAt) };
}
