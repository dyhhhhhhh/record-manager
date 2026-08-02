import { describe, expect, it } from "vitest";

import {
  canonicalizeHmvCoverUrl,
  canonicalizeHmvProductUrl,
  canonicalizeShopifyCoverUrl,
  canonicalizeStoreProductUrl,
  isTrustedCoverUrl
} from "@/features/covers/trusted-cover-url";

describe("trusted cover and product URLs", () => {
  it("canonicalizes HMV image and product endpoints", () => {
    expect(canonicalizeHmvCoverUrl("https://img.hmv.co.jp/img.asp?size=50&sku=19000001"))
      .toBe("https://img.hmv.co.jp/img.asp?sku=19000001&size=190");
    expect(canonicalizeHmvProductUrl("https://www.hmv.co.jp/product/detail/19000001/"))
      .toBe("https://www.hmv.co.jp/product/detail/19000001");
    expect(isTrustedCoverUrl("https://img.hmv.co.jp/img.asp?sku=19000001&size=190", "hmv")).toBe(true);
  });

  it.each([
    "http://img.hmv.co.jp/img.asp?sku=1&size=190",
    "https://attacker.example/img.asp?sku=1&size=190",
    "https://img.hmv.co.jp/other?sku=1",
    "https://img.hmv.co.jp/img.asp?sku=not-a-number"
  ])("rejects an untrusted HMV cover URL: %s", (url) => {
    expect(canonicalizeHmvCoverUrl(url)).toBeNull();
    expect(isTrustedCoverUrl(url, "hmv")).toBe(false);
  });

  it.each([
    "http://www.hmv.co.jp/product/detail/1",
    "https://attacker.example/product/detail/1",
    "https://www.hmv.co.jp/product/detail/not-a-number",
    "https://www.hmv.co.jp/product/detail/1/extra"
  ])("rejects an untrusted HMV product URL: %s", (url) => {
    expect(canonicalizeHmvProductUrl(url)).toBeNull();
  });

  it("keeps iMusic trust isolated from HMV", () => {
    expect(isTrustedCoverUrl("https://imusic.b-cdn.net/images/item/cover.jpg", "imusic")).toBe(true);
    expect(isTrustedCoverUrl("https://imusic.b-cdn.net/images/item/cover.jpg", "hmv")).toBe(false);
    expect(isTrustedCoverUrl("https://img.hmv.co.jp/img.asp?sku=1&size=190", "imusic")).toBe(false);
  });

  it.each([
    ["mutant", "https://madebymutant.com/products/synthetic-score"],
    ["black_screen", "https://www.blackscreenrecords.com/products/synthetic-release"],
    ["laced", "https://lacedrecords.co/products/synthetic-archive"]
  ] as const)("accepts the official %s product host", (merchant, url) => {
    expect(canonicalizeStoreProductUrl(`${url}?utm_source=mail#details`, merchant)).toBe(url);
  });

  it.each([
    ["mutant", "http://madebymutant.com/products/synthetic-score"],
    ["mutant", "https://madebymutant.com.attacker.example/products/synthetic-score"],
    ["black_screen", "https://blackscreenrecords.com@example.test/products/synthetic-release"],
    ["laced", "https://lacedrecords.com/products/synthetic-archive"],
    ["laced", "https://lacedrecords.co/pages/about"]
  ] as const)("rejects an unofficial %s product URL", (merchant, url) => {
    expect(canonicalizeStoreProductUrl(url, merchant)).toBeNull();
  });

  it("accepts Shopify file covers for all three independent stores", () => {
    const source = "https://cdn.shopify.com/s/files/1/0000/0001/files/synthetic-cover.jpg?v=1";
    expect(canonicalizeShopifyCoverUrl(source)).toBe(source);
    for (const merchant of ["mutant", "black_screen", "laced"] as const) {
      expect(isTrustedCoverUrl(source, merchant)).toBe(true);
    }
  });

  it.each([
    "http://cdn.shopify.com/s/files/1/0000/0001/files/cover.jpg",
    "https://cdn.shopify.com/assets/email-logo.png",
    "https://cdn.shopify.com.attacker.example/s/files/1/cover.jpg",
    "https://user@cdn.shopify.com/s/files/1/cover.jpg"
  ])("rejects an untrusted Shopify cover URL: %s", (url) => {
    expect(canonicalizeShopifyCoverUrl(url)).toBeNull();
    expect(isTrustedCoverUrl(url, "mutant")).toBe(false);
  });
});
