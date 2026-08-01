import { describe, expect, it } from "vitest";

import { parseOrderEditForm } from "@/features/orders/order-form";

describe("order edit form", () => {
  it("validates and normalizes the complete fee breakdown", () => {
    const form = new FormData();
    form.set("externalOrderId", "90000001");
    form.set("orderedAt", "2026-07-29T11:27");
    form.set("currency", "cny");
    form.set("itemsSubtotal", "430.00");
    form.set("shippingTotal", "98.00");
    form.set("shippingMethod", " FedEx International ");
    form.set("taxTotal", "6.00");
    form.set("originalTotal", "528.00");
    form.set("effectiveTotal", "500.00");

    expect(parseOrderEditForm(form)).toMatchObject({
      externalOrderId: "90000001",
      currency: "CNY",
      itemsSubtotal: "430.00",
      shippingTotal: "98.00",
      shippingMethod: "FedEx International",
      taxTotal: "6.00",
      originalTotal: "528.00",
      effectiveTotal: "500.00"
    });
  });
});
