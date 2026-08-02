import { describe, expect, it } from "vitest";

import { planStoredItemEnrichment } from "@/features/orders/stored-item-enrichment";

describe("stored order item enrichment plan", () => {
  it("fills missing metadata and schedules an empty cover for download", () => {
    const result = planStoredItemEnrichment(
      [{
        id: "item-1",
        album_title: "Album",
        artist_name: "未知艺人",
        unit_price: "1000",
        quantity: 1,
        image_path: null,
        source_image_url: null,
        product_url: null
      }],
      [{
        albumTitle: "Album",
        artistName: "Artist",
        unitPrice: "1000",
        quantity: 1,
        imageUrl: "https://img.hmv.co.jp/img.asp?sku=1&size=190",
        productUrl: "https://www.hmv.co.jp/product/detail/1"
      }]
    );

    expect(result).toEqual({
      warnings: [],
      updates: [{
        id: "item-1",
        artistName: "Artist",
        sourceImageUrl: "https://img.hmv.co.jp/img.asp?sku=1&size=190",
        productUrl: "https://www.hmv.co.jp/product/detail/1",
        coverUrl: "https://img.hmv.co.jp/img.asp?sku=1&size=190"
      }]
    });
  });

  it("protects edited artists and manual covers while still filling an empty product link", () => {
    const result = planStoredItemEnrichment(
      [{
        id: "item-1",
        album_title: "Album",
        artist_name: "Edited Artist",
        unit_price: "1000",
        quantity: 1,
        image_path: "owner/item-1.jpg",
        source_image_url: null,
        product_url: null
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

    expect(result.updates).toEqual([{ id: "item-1", productUrl: "https://www.hmv.co.jp/product/detail/1" }]);
  });

  it("retries an existing source URL when storage is still empty", () => {
    const source = "https://img.hmv.co.jp/img.asp?sku=1&size=190";
    const result = planStoredItemEnrichment(
      [{
        id: "item-1",
        album_title: "Album",
        artist_name: "Artist",
        unit_price: "1000",
        quantity: 1,
        image_path: null,
        source_image_url: source,
        product_url: "https://www.hmv.co.jp/product/detail/1"
      }],
      []
    );

    expect(result.updates).toEqual([{ id: "item-1", coverUrl: source }]);
  });
});
