import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyBlackScreenHeaders,
  parseBlackScreenMessage
} from "@/features/mail/black-screen-parser";

function fixture(name: string, encoding?: BufferEncoding) {
  return readFile(join(process.cwd(), "src/features/mail/fixtures", name), encoding);
}

const confirmationHeaders = {
  from: "synthetic@blackscreenrecords.com",
  fromName: "Black Screen Records",
  replyTo: "",
  subject: "Order #71000001 confirmed"
};

const shipmentHeaders = {
  from: "synthetic@sendcloud.com",
  fromName: "Black Screen Records",
  replyTo: "synthetic@blackscreenrecords.com",
  subject: "Your order #71000001 is delivered"
};

describe("Black Screen Records order mail", () => {
  it("classifies the confirmation and both trusted Sendcloud statuses", () => {
    expect(classifyBlackScreenHeaders(confirmationHeaders)).toBe("order_confirmation");
    expect(classifyBlackScreenHeaders({
      ...shipmentHeaders,
      subject: "Your order #71000001 is ready to be shipped"
    })).toBe("shipment");
    expect(classifyBlackScreenHeaders(shipmentHeaders)).toBe("shipment");
  });

  it.each([
    { ...shipmentHeaders, from: "synthetic@fake-sendcloud.com" },
    { ...shipmentHeaders, fromName: "Another Store" },
    { ...shipmentHeaders, replyTo: "synthetic@attacker.example" },
    { ...shipmentHeaders, subject: "Your order #71000001 is delivered — open this" },
    { ...shipmentHeaders, subject: "Your order 71000001 is delivered" },
    { ...confirmationHeaders, subject: "Order 71000001 confirmed" },
    { ...confirmationHeaders, from: "synthetic@fake-blackscreenrecords.com" }
  ])("rejects a header outside the complete trust boundary", (headers) => {
    expect(classifyBlackScreenHeaders(headers)).toBeNull();
  });

  it("parses Orderly product rows and European amounts", async () => {
    const result = await parseBlackScreenMessage(await fixture("black-screen-order-confirmation.eml"));
    expect(result).toMatchObject({
      merchant: "black_screen",
      type: "order_confirmation",
      externalOrderId: "71000001",
      currency: "EUR",
      itemsSubtotal: "190.00",
      shippingTotal: "20.00",
      shippingMethod: "Spring",
      discountTotal: "0",
      taxTotal: "33.53",
      total: "210.00",
      items: [{
        albumTitle: "Synthetic Release One · Deluxe Variant",
        artistName: "未知艺人",
        unitPrice: "95.00",
        quantity: 2,
        imageUrl: "https://cdn.shopify.com/s/files/1/0000/0003/files/synthetic-release-one.jpg",
        productUrl: "https://blackscreenrecords.com/products/synthetic-release-one"
      }]
    });
  });

  it.each(["black-screen-ready-to-ship.eml", "black-screen-delivered.eml"])(
    "keeps Sendcloud status %s at shipment without product guesses",
    async (name) => {
      expect(await parseBlackScreenMessage(await fixture(name))).toMatchObject({
        merchant: "black_screen",
        type: "shipment",
        externalOrderId: "71000001",
        itemHints: [],
        items: []
      });
    }
  );

  it("revalidates Sendcloud display name and Reply-To from the parsed source", async () => {
    const source = (await fixture("black-screen-delivered.eml", "utf8")) as string;
    await expect(parseBlackScreenMessage(source.replace(
      "From: Black Screen Records",
      "From: Another Store"
    ))).resolves.toBeNull();
    await expect(parseBlackScreenMessage(source.replace(
      "synthetic@blackscreenrecords.com",
      "synthetic@attacker.example"
    ))).resolves.toBeNull();
  });

  it("rejects inconsistent totals and confirmations without product rows", async () => {
    const source = (await fixture("black-screen-order-confirmation.eml", "utf8")) as string;
    await expect(parseBlackScreenMessage(source.replace("€210,00", "€209,00")))
      .rejects.toThrow(/实付/);
    await expect(parseBlackScreenMessage(source.replace("line-item-description", "not-a-product")))
      .rejects.toThrow(/商品/);
  });
});
