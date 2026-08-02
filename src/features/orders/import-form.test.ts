import { describe, expect, it } from "vitest";

import { parseOrderConfirmationForm } from "@/features/orders/import-form";

describe("order confirmation form", () => {
  it("turns editable form rows into an atomic order payload", () => {
    const form = new FormData();
    form.set("externalOrderId", "90000001");
    form.set("orderedAt", "2026-07-29T03:27");
    form.set("currency", "cny");
    form.set("itemsSubtotal", "430.00");
    form.set("shippingTotal", "98.00");
    form.set("shippingMethod", " FedEx International ");
    form.set("discountTotal", "0");
    form.set("taxTotal", "6.00");
    form.set("total", "528.00");
    form.set("itemCount", "1");
    form.set("albumTitle.0", " Example Album ");
    form.set("artistName.0", " Example Artist ");
    form.set("unitPrice.0", "430.00");
    form.set("quantity.0", "1");
    form.set("imageUrl.0", "https://imusic.b-cdn.net/cover.jpg");

    expect(parseOrderConfirmationForm(form)).toMatchObject({
      externalOrderId: "90000001",
      currency: "CNY",
      itemsSubtotal: "430.00",
      shippingTotal: "98.00",
      shippingMethod: "FedEx International",
      discountTotal: "0",
      taxTotal: "6.00",
      total: "528.00",
      items: [{ albumTitle: "Example Album", artistName: "Example Artist", unitPrice: "430.00", quantity: 1 }]
    });
  });

  it("rejects a confirmation with no records", () => {
    const form = new FormData();
    form.set("externalOrderId", "90000001");
    form.set("orderedAt", "2026-07-29T03:27");
    form.set("currency", "CNY");
    form.set("itemsSubtotal", "430.00");
    form.set("shippingTotal", "98.00");
    form.set("shippingMethod", "FedEx International");
    form.set("discountTotal", "0");
    form.set("taxTotal", "0");
    form.set("total", "528.00");
    form.set("itemCount", "0");
    expect(() => parseOrderConfirmationForm(form)).toThrow(/唱片/);
  });

  it("rejects an edited import whose discount no longer reconciles with the total", () => {
    const form = new FormData();
    form.set("externalOrderId", "90000001");
    form.set("orderedAt", "2026-07-29T03:27");
    form.set("currency", "JPY");
    form.set("itemsSubtotal", "10000");
    form.set("shippingTotal", "330");
    form.set("shippingMethod", "Ship when complete.");
    form.set("discountTotal", "4000");
    form.set("taxTotal", "0");
    form.set("total", "7000");
    form.set("itemCount", "1");
    form.set("albumTitle.0", "Album");
    form.set("artistName.0", "未知艺人");
    form.set("unitPrice.0", "10000");
    form.set("quantity.0", "1");

    expect(() => parseOrderConfirmationForm(form)).toThrow(/实付/);
  });
});
