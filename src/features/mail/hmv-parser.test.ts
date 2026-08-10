import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyHmvHeaders, parseHmvMessage } from "@/features/mail/hmv-parser";

const fixture = (name: string) => readFile(join(process.cwd(), "src/features/mail/fixtures", name));

const COVERED_CONFIRMATION_ITEMS = [
  ["Synthetic Waves〜Vinyl Edition〜(2nd Press)", "19000001"],
  ["Synthetic Sunlight (repress)", "19000002"],
  ["Synthetic Session", "19000003"],
  ["Synthetic Archive Human", "19000004"],
  ["Synthetic Planet", "19000005"],
  ["Synthetic Space Return", "19000006"],
  ["SYNTHETIC ARCHIVE O.S.T.+", "19000007"],
  ["Synthetic Archive O.s.t.2", "19000008"]
] as const;

async function coveredConfirmationFixture() {
  const source = (await fixture("hmv-order-confirmation.eml")).toString("utf8");
  const bodyStart = source.indexOf("\n\n");
  const headers = source.slice(0, bodyStart)
    .replace("Content-Type: text/plain; charset=UTF-8", "Content-Type: multipart/alternative; boundary=hmv-covered");
  const body = source.slice(bodyStart + 2);
  const html = COVERED_CONFIRMATION_ITEMS.map(([title, id]) => `
    <a href="https://www.hmv.co.jp/en/product/detail/${id}">
      <img src="https://img.hmv.co.jp/image/jacket/190/00/0/0/${id}.jpg" alt="${title}">
    </a>
    <a href="https://www.hmv.co.jp/en/product/detail/${id}">${title}</a>
  `).join("");

  return `${headers}

--hmv-covered
Content-Type: text/plain; charset=UTF-8

${body}
--hmv-covered
Content-Type: text/html; charset=UTF-8

<html><body>${html}</body></html>
--hmv-covered--
`;
}

describe("HMV Japan mail classifier", () => {
  it.each([
    ["Thank you for your order.", "order_confirmation"],
    ["Thank you for your payment of order.", "order_confirmation"],
    ["Your order items have been dispatched from our warehouse.", "shipment"],
    ["Cancellation of Your Order", "cancellation"]
  ] as const)("classifies %s", (subject, expected) => {
    expect(classifyHmvHeaders({ from: "email@hmv.co.jp", subject })).toBe(expected);
  });

  it("rejects lookalike senders and unsupported subjects", () => {
    expect(classifyHmvHeaders({ from: "email@fake-hmv.co.jp", subject: "Cancellation of Your Order" })).toBeNull();
    expect(classifyHmvHeaders({ from: "email@hmv.co.jp", subject: "HMV weekly news" })).toBeNull();
  });
});

describe("HMV Japan message parser", () => {
  it("parses an eight-item discounted confirmation with placeholders", async () => {
    const result = await parseHmvMessage(await fixture("hmv-order-confirmation.eml"));

    expect(result).toMatchObject({
      merchant: "hmv",
      type: "order_confirmation",
      externalOrderId: "91000001",
      currency: "JPY",
      itemsSubtotal: "44440",
      shippingTotal: "330",
      shippingMethod: "Ship when complete.",
      discountTotal: "30110",
      taxTotal: "0",
      total: "14660"
    });
    expect(result?.type).toBe("order_confirmation");
    if (result?.type === "order_confirmation") {
      expect(result.items).toHaveLength(8);
      expect(result.items.every((item) => item.artistName === "未知艺人" && item.imageUrl === undefined)).toBe(true);
    }
  });

  it("parses the new HMV order-confirmation subject", async () => {
    const source = (await fixture("hmv-order-confirmation.eml"))
      .toString("utf8")
      .replace("Thank you for your payment of order.", "Thank you for your order.");

    await expect(parseHmvMessage(source)).resolves.toMatchObject({
      merchant: "hmv",
      type: "order_confirmation",
      externalOrderId: "91000001",
      itemsSubtotal: "44440",
      shippingTotal: "330",
      total: "14660"
    });
  });

  it("parses official covers and product links from the new confirmation HTML", async () => {
    const result = await parseHmvMessage(await coveredConfirmationFixture());

    expect(result?.type).toBe("order_confirmation");
    if (result?.type === "order_confirmation") {
      expect(result.items).toHaveLength(8);
      expect(result.items.every((item) => Boolean(item.imageUrl && item.productUrl))).toBe(true);
      expect(result.items[0]).toMatchObject({
        imageUrl: "https://img.hmv.co.jp/image/jacket/190/00/0/0/19000001.jpg",
        productUrl: "https://www.hmv.co.jp/en/product/detail/19000001"
      });
    }
  });

  it("defaults a missing coupon line to zero when the totals reconcile", async () => {
    const source = (await fixture("hmv-order-confirmation.eml")).toString("utf8")
      .replace(/Coupon\/Special Coupon[^\r\n]*(?:\r?\n)?/, "")
      .replace("￥14,660", "￥44,770");

    const result = await parseHmvMessage(source);

    expect(result).toMatchObject({
      type: "order_confirmation",
      itemsSubtotal: "44440",
      shippingTotal: "330",
      discountTotal: "0",
      total: "44770"
    });
  });

  it("includes an unlisted overseas tax adjustment in the effective discount", async () => {
    const source = (await fixture("hmv-order-confirmation.eml")).toString("utf8")
      .replace("￥14,660", "￥11,071");

    const result = await parseHmvMessage(source);

    expect(result).toMatchObject({
      type: "order_confirmation",
      itemsSubtotal: "44440",
      shippingTotal: "330",
      discountTotal: "33699",
      total: "11071"
    });
  });

  it("parses dispatched items with artists, canonical covers and product links", async () => {
    const result = await parseHmvMessage(await fixture("hmv-order-dispatched.eml"));

    expect(result?.type).toBe("shipment");
    if (result?.type === "shipment") {
      expect(result.items).toHaveLength(8);
      expect(result.items[0]).toEqual({
        albumTitle: "Synthetic Planet",
        artistName: "Synthetic Artist A",
        unitPrice: "6600",
        quantity: 1,
        imageUrl: "https://img.hmv.co.jp/img.asp?sku=19000001&size=190",
        productUrl: "https://www.hmv.co.jp/product/detail/19000001"
      });
    }
  });

  it("parses ten cancelled items and their metadata", async () => {
    const result = await parseHmvMessage(await fixture("hmv-order-cancelled.eml"));

    expect(result).toMatchObject({ merchant: "hmv", type: "cancellation", externalOrderId: "91000002" });
    expect(result?.type).toBe("cancellation");
    if (result?.type === "cancellation") {
      expect(result.items).toHaveLength(10);
      expect(result.items[9]).toMatchObject({
        artistName: "Artist Ten",
        albumTitle: "Cancelled Album 10",
        imageUrl: "https://img.hmv.co.jp/img.asp?sku=17000010&size=190"
      });
    }
  });

  it("fails a supported HMV template without an order number", async () => {
    const source = (await fixture("hmv-order-confirmation.eml")).toString("utf8").replaceAll("91000001", "missing");
    await expect(parseHmvMessage(source)).rejects.toThrow(/订单 ID/);
  });
});
