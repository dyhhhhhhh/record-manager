import { describe, expect, it } from "vitest";

import { mailEventPayloadSchema, merchantSchema, moneySchema } from "@/types/domain";

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
          unitPrice: "49.99",
          quantity: 1,
          imageUrl: "https://imusic.example/cover.jpg"
        }
      ]
    });

    expect(result).toMatchObject({
      type: "order_confirmation",
      merchant: "imusic",
      discountTotal: "0"
    });
  });

  it("accepts all five supported merchant identities", () => {
    expect(merchantSchema.options).toEqual([
      "imusic",
      "hmv",
      "mutant",
      "black_screen",
      "laced"
    ]);

    for (const merchant of ["mutant", "black_screen", "laced"] as const) {
      expect(mailEventPayloadSchema.parse({
        merchant,
        type: "shipment",
        externalOrderId: `${merchant}-order`,
        occurredAt: "2026-07-31T10:00:00.000Z"
      })).toMatchObject({ merchant, type: "shipment" });
    }
  });

  it("supports HMV discounts when item totals and the payable total reconcile", () => {
    expect(mailEventPayloadSchema.parse({
      merchant: "hmv",
      type: "order_confirmation",
      externalOrderId: "90000001",
      occurredAt: "2026-07-31T10:00:00.000Z",
      currency: "JPY",
      itemsSubtotal: "10000",
      shippingTotal: "330",
      shippingMethod: "Ship when complete.",
      discountTotal: "4000",
      taxTotal: "0",
      total: "6330",
      items: [
        { albumTitle: "First", artistName: "未知艺人", unitPrice: "4000", quantity: 1 },
        { albumTitle: "Second", artistName: "未知艺人", unitPrice: "3000", quantity: 2 }
      ]
    })).toMatchObject({ merchant: "hmv", discountTotal: "4000", total: "6330" });
  });

  it("rejects confirmations whose item subtotal or payable total does not reconcile", () => {
    const payload = {
      merchant: "hmv",
      type: "order_confirmation",
      externalOrderId: "90000001",
      occurredAt: "2026-07-31T10:00:00.000Z",
      currency: "JPY",
      itemsSubtotal: "10000",
      shippingTotal: "330",
      shippingMethod: "Ship when complete.",
      discountTotal: "4000",
      taxTotal: "0",
      total: "6330",
      items: [{ albumTitle: "First", artistName: "未知艺人", unitPrice: "9000", quantity: 1 }]
    } as const;

    expect(() => mailEventPayloadSchema.parse(payload)).toThrow(/商品原价/);
    expect(() => mailEventPayloadSchema.parse({
      ...payload,
      items: [{ ...payload.items[0], unitPrice: "10000" }],
      total: "6000"
    })).toThrow(/实付/);
  });

  it("models shipment and cancellation status events", () => {
    expect(
      mailEventPayloadSchema.parse({
        type: "shipment",
        externalOrderId: "13586477",
        occurredAt: "2026-07-31T10:00:00.000Z"
      })
    ).toMatchObject({ type: "shipment", merchant: "imusic", items: [] });

    expect(
      mailEventPayloadSchema.parse({
        type: "cancellation",
        externalOrderId: "13564999",
        occurredAt: "2026-07-31T10:00:00.000Z",
        itemHints: ["Example LP"]
      })
    ).toMatchObject({ type: "cancellation", merchant: "imusic", items: [] });
  });
});
