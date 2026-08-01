import { describe, expect, it } from "vitest";

import { buildCollection } from "@/features/orders/collection";

const orders = [
  {
    id: "one",
    external_order_id: "1001",
    ordered_at: "2026-07-01T00:00:00Z",
    currency: "CNY",
    effective_total: "300.00",
    shipping_total: "20.00",
    tax_total: "15.50",
    fulfillment_status: "received",
    cancelled_at: null,
    order_items: [
      { id: "a", album_title: "Blue Train", artist_name: "John Coltrane", unit_price: "200.00", quantity: 1, image_path: null, cancelled_at: null },
      { id: "b", album_title: "Cancelled LP", artist_name: "Nobody", unit_price: "100.00", quantity: 1, image_path: null, cancelled_at: "2026-07-02T00:00:00Z" }
    ]
  },
  {
    id: "two",
    external_order_id: "1002",
    ordered_at: "2026-06-01T00:00:00Z",
    currency: "EUR",
    effective_total: "50.50",
    shipping_total: "5.00",
    tax_total: "2.00",
    fulfillment_status: "ordered",
    cancelled_at: "2026-06-02T00:00:00Z",
    order_items: [
      { id: "c", album_title: "Hidden", artist_name: "Hidden", unit_price: "50.50", quantity: 1, image_path: null, cancelled_at: null }
    ]
  }
] as const;

describe("record collection", () => {
  it("excludes cancelled orders and items but keeps received records", () => {
    const result = buildCollection(orders, "");
    expect(result.records.map((record) => record.album_title)).toEqual(["Blue Train"]);
    expect(result.stats).toEqual([{
      currency: "CNY",
      total: "300.00",
      shippingTotal: "20.00",
      taxTotal: "15.50",
      orderCount: 1,
      recordCount: 1
    }]);
  });

  it("searches by album, artist and order id", () => {
    expect(buildCollection(orders, "coltrane").records).toHaveLength(1);
    expect(buildCollection(orders, "1001").records).toHaveLength(1);
    expect(buildCollection(orders, "nobody").records).toHaveLength(0);
  });

  it("accepts numeric money values returned by Supabase", () => {
    const numericOrder = {
      ...orders[0],
      effective_total: 300,
      shipping_total: 20,
      tax_total: 15.5,
      order_items: orders[0].order_items.map((item) => ({
        ...item,
        unit_price: Number(item.unit_price)
      }))
    };

    expect(buildCollection([numericOrder], "").stats).toEqual([
      {
        currency: "CNY",
        total: "300.00",
        shippingTotal: "20.00",
        taxTotal: "15.50",
        orderCount: 1,
        recordCount: 1
      }
    ]);
  });
});
