import { z } from "zod";

import { parseShanghaiDateTimeInput } from "@/lib/date-time";
import { currencySchema, moneySchema, orderAccountingErrors } from "@/types/domain";

const orderEditSchema = z.object({
  externalOrderId: z.string().trim().min(1),
  orderedAt: z.string().trim().min(1),
  currency: z.string().trim().transform((value) => value.toLocaleUpperCase()).pipe(currencySchema),
  itemsSubtotal: moneySchema,
  shippingTotal: moneySchema,
  additionalFeeTotal: moneySchema,
  shippingMethod: z.string().trim().transform((value) => value || null),
  discountTotal: moneySchema,
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
    additionalFeeTotal: formData.get("additionalFeeTotal") ?? "0",
    shippingMethod: formData.get("shippingMethod"),
    discountTotal: formData.get("discountTotal"),
    taxTotal: formData.get("taxTotal"),
    originalTotal: formData.get("originalTotal"),
    effectiveTotal: formData.get("effectiveTotal")
  });

  const accountingError = orderAccountingErrors({
    itemsSubtotal: values.itemsSubtotal,
    shippingTotal: values.shippingTotal,
    additionalFeeTotal: values.additionalFeeTotal,
    discountTotal: values.discountTotal,
    total: values.originalTotal
  }, "订单总额")[0];
  if (accountingError) throw new Error(accountingError);

  return { ...values, orderedAt: parseShanghaiDateTimeInput(values.orderedAt) };
}
