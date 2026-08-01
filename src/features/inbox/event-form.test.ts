import { describe, expect, it } from "vitest";

import { parseOrderConfirmationForm } from "@/features/inbox/event-form";

describe("order confirmation form", () => {
  it("turns editable form rows into an atomic order payload", () => {
    const form = new FormData();
    form.set("externalOrderId", "90000001");
    form.set("orderedAt", "2026-07-29T03:27");
    form.set("currency", "cny");
    form.set("total", "528.00");
    form.set("itemCount", "1");
    form.set("albumTitle.0", " Example Album ");
    form.set("artistName.0", " Example Artist ");
    form.set("unitPrice.0", "248.00");
    form.set("quantity.0", "1");
    form.set("imageUrl.0", "https://imusic.b-cdn.net/cover.jpg");

    expect(parseOrderConfirmationForm(form)).toMatchObject({
      externalOrderId: "90000001",
      currency: "CNY",
      total: "528.00",
      items: [{ albumTitle: "Example Album", artistName: "Example Artist", unitPrice: "248.00", quantity: 1 }]
    });
  });

  it("rejects a confirmation with no records", () => {
    const form = new FormData();
    form.set("externalOrderId", "90000001");
    form.set("orderedAt", "2026-07-29T03:27");
    form.set("currency", "CNY");
    form.set("total", "528.00");
    form.set("itemCount", "0");
    expect(() => parseOrderConfirmationForm(form)).toThrow(/唱片/);
  });
});
