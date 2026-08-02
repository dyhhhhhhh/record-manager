import { describe, expect, it } from "vitest";

import { mergeOrderConfirmationMetadata, mergeOrderItemMetadata } from "@/features/orders/item-enrichment";

describe("order item metadata enrichment", () => {
  it("matches reordered titles after Unicode and wave-dash normalization", () => {
    const result = mergeOrderItemMetadata(
      [
        { albumTitle: "Synthetic Waves〜Vinyl Edition〜", artistName: "未知艺人", unitPrice: "4620", quantity: 1 },
        { albumTitle: "Synthetic Session", artistName: "未知艺人", unitPrice: "4950", quantity: 1 }
      ],
      [
        {
          albumTitle: "Synthetic Session",
          artistName: "Synthetic Artist D",
          unitPrice: "4950",
          quantity: 1,
          imageUrl: "https://img.hmv.co.jp/img.asp?sku=2&size=190"
        },
        {
          albumTitle: "Synthetic Waves～Vinyl Edition～",
          artistName: "Synthetic Artist C",
          unitPrice: "4620",
          quantity: 1,
          imageUrl: "https://img.hmv.co.jp/img.asp?sku=1&size=190",
          productUrl: "https://www.hmv.co.jp/product/detail/1"
        }
      ]
    );

    expect(result.warnings).toEqual([]);
    expect(result.items).toEqual([
      {
        albumTitle: "Synthetic Waves〜Vinyl Edition〜",
        artistName: "Synthetic Artist C",
        unitPrice: "4620",
        quantity: 1,
        imageUrl: "https://img.hmv.co.jp/img.asp?sku=1&size=190",
        productUrl: "https://www.hmv.co.jp/product/detail/1"
      },
      {
        albumTitle: "Synthetic Session",
        artistName: "Synthetic Artist D",
        unitPrice: "4950",
        quantity: 1,
        imageUrl: "https://img.hmv.co.jp/img.asp?sku=2&size=190"
      }
    ]);
  });

  it("never overwrites edited artists or existing image and product URLs", () => {
    const result = mergeOrderItemMetadata(
      [{
        albumTitle: "Album",
        artistName: "Edited Artist",
        unitPrice: "1000",
        quantity: 1,
        imageUrl: "https://example.com/manual.jpg",
        productUrl: "https://example.com/manual"
      }],
      [{
        albumTitle: "Album",
        artistName: "Mail Artist",
        unitPrice: "1000",
        quantity: 1,
        imageUrl: "https://img.hmv.co.jp/img.asp?sku=1&size=190",
        productUrl: "https://www.hmv.co.jp/product/detail/1"
      }]
    );

    expect(result.items[0]).toMatchObject({
      artistName: "Edited Artist",
      imageUrl: "https://example.com/manual.jpg",
      productUrl: "https://example.com/manual"
    });
  });

  it("leaves duplicate matching groups untouched and reports one warning", () => {
    const base = [
      { albumTitle: "Same", artistName: "未知艺人", unitPrice: "1000", quantity: 1 },
      { albumTitle: "Same", artistName: "未知艺人", unitPrice: "1000", quantity: 1 }
    ];
    const result = mergeOrderItemMetadata(base, [
      { albumTitle: "Same", artistName: "One", unitPrice: "1000", quantity: 1 },
      { albumTitle: "Same", artistName: "Two", unitPrice: "1000", quantity: 1 }
    ]);

    expect(result.items).toEqual(base);
    expect(result.warnings).toEqual([expect.stringMatching(/歧义.*Same/)]);
  });

  it("merges only later metadata from the same merchant and order", () => {
    const confirmation = {
      merchant: "hmv" as const,
      type: "order_confirmation" as const,
      externalOrderId: "91000001",
      occurredAt: "2026-07-20T00:00:00.000Z",
      currency: "JPY",
      itemsSubtotal: "1000",
      shippingTotal: "0",
      shippingMethod: "Ship when complete.",
      discountTotal: "0",
      taxTotal: "0",
      total: "1000",
      items: [{ albumTitle: "Album", artistName: "未知艺人", unitPrice: "1000", quantity: 1 }]
    };
    const result = mergeOrderConfirmationMetadata(confirmation, [
      {
        merchant: "imusic",
        type: "shipment",
        externalOrderId: "91000001",
        occurredAt: "2026-07-21T00:00:00.000Z",
        itemHints: [],
        items: [{ albumTitle: "Album", artistName: "Wrong Merchant", unitPrice: "1000", quantity: 1 }]
      },
      {
        merchant: "hmv",
        type: "shipment",
        externalOrderId: "91000001",
        occurredAt: "2026-07-22T00:00:00.000Z",
        itemHints: [],
        items: [{ albumTitle: "Album", artistName: "Correct Artist", unitPrice: "1000", quantity: 1 }]
      }
    ]);

    expect(result.payload.items[0].artistName).toBe("Correct Artist");
    expect(result.warnings).toEqual([]);
  });
});
