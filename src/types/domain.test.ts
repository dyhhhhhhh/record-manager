import { describe, expect, it } from "vitest";

import { mailEventPayloadSchema, moneySchema } from "@/types/domain";

describe("domain contracts", () => {
  it("keeps money as a decimal string", () => {
    expect(moneySchema.parse("1499.95")).toBe("1499.95");
    expect(() => moneySchema.parse(1499.95)).toThrow();
    expect(() => moneySchema.parse("-1")).toThrow();
  });

  it("requires complete order items for confirmation events", () => {
    const result = mailEventPayloadSchema.parse({
      type: "order_confirmation",
      externalOrderId: "13772603",
      occurredAt: "2026-07-31T10:00:00.000Z",
      currency: "EUR",
      itemsSubtotal: "49.99",
      shippingTotal: "5.00",
      shippingMethod: "PostNord Tracked",
      taxTotal: "0",
      total: "54.99",
      items: [
        {
          albumTitle: "Selected Ambient Works 85-92",
          artistName: "Aphex Twin",
          unitPrice: "29.99",
          quantity: 1,
          imageUrl: "https://imusic.example/cover.jpg"
        }
      ]
    });

    expect(result.type).toBe("order_confirmation");
  });

  it("models shipment and cancellation status events", () => {
    expect(
      mailEventPayloadSchema.parse({
        type: "shipment",
        externalOrderId: "13586477",
        occurredAt: "2026-07-31T10:00:00.000Z"
      })
    ).toMatchObject({ type: "shipment" });

    expect(
      mailEventPayloadSchema.parse({
        type: "cancellation",
        externalOrderId: "13564999",
        occurredAt: "2026-07-31T10:00:00.000Z",
        itemHints: ["Example LP"]
      })
    ).toMatchObject({ type: "cancellation" });
  });
});
