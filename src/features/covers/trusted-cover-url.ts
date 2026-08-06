import type { Merchant } from "@/types/domain";

const IMUSIC_COVER_HOSTS = new Set(["imusic.b-cdn.net", "imusic-static.b-cdn.net"]);

const STORE_PRODUCT_HOSTS: Partial<Record<Merchant, ReadonlySet<string>>> = {
  mutant: new Set(["madebymutant.com", "www.madebymutant.com"]),
  black_screen: new Set(["blackscreenrecords.com", "www.blackscreenrecords.com"]),
  laced: new Set(["lacedrecords.co", "www.lacedrecords.co"])
};

export function isTrustedImusicCoverUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && IMUSIC_COVER_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function canonicalizeHmvCoverUrl(value: string) {
  try {
    const url = new URL(value);
    const sku = url.searchParams.get("sku") ?? "";
    if (url.protocol !== "https:" || url.hostname !== "img.hmv.co.jp" || url.pathname.toLocaleLowerCase() !== "/img.asp" || !/^\d+$/.test(sku)) {
      return null;
    }
    return `https://img.hmv.co.jp/img.asp?sku=${sku}&size=190`;
  } catch {
    return null;
  }
}

export function canonicalizeHmvProductUrl(value: string) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/product\/detail\/(\d+)\/?$/i);
    if (url.protocol !== "https:" || url.hostname !== "www.hmv.co.jp" || !match) return null;
    return `https://www.hmv.co.jp/product/detail/${match[1]}`;
  } catch {
    return null;
  }
}

export function canonicalizeCdJapanProductUrl(value: string) {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/product\/([A-Za-z0-9._-]+)\/?$/);
    if (
      url.protocol !== "https:"
      || url.hostname !== "www.cdjapan.co.jp"
      || url.username
      || url.password
      || !match?.[1]
    ) return null;
    return `https://www.cdjapan.co.jp/product/${match[1]}`;
  } catch {
    return null;
  }
}

export function canonicalizeShopifyCoverUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.hostname !== "cdn.shopify.com"
      || url.username
      || url.password
      || !url.pathname.startsWith("/s/files/")
      || url.pathname === "/s/files/"
    ) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function canonicalizeStoreProductUrl(value: string, merchant: Merchant) {
  try {
    const url = new URL(value);
    const hosts = STORE_PRODUCT_HOSTS[merchant];
    const match = url.pathname.match(/^\/products\/([^/]+)\/?$/);
    if (
      !hosts
      || url.protocol !== "https:"
      || !hosts.has(url.hostname)
      || url.username
      || url.password
      || !match
    ) return null;
    return `https://${url.hostname}/products/${match[1]}`;
  } catch {
    return null;
  }
}

export function isTrustedCoverUrl(value: string, merchant: Merchant) {
  if (merchant === "imusic") return isTrustedImusicCoverUrl(value);
  if (merchant === "hmv") return canonicalizeHmvCoverUrl(value) !== null;
  if (merchant === "cdjapan") return false;
  return canonicalizeShopifyCoverUrl(value) !== null;
}
