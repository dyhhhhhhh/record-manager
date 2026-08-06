import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyCdJapanHeaders, parseCdJapanMessage } from "@/features/mail/cdjapan-parser";

const fixture = (name: string) => readFile(join(process.cwd(), "src/features/mail/fixtures", name));

describe("CDJapan mail classifier", () => {
  it.each([
    ["Order Confirmation #73000001", "order_confirmation"],
    ["Order Update: We Shipped Your Order Today", "shipment"]
  ] as const)("classifies the verified template subject %s", (subject, expected) => {
    expect(classifyCdJapanHeaders({ from: "orders@cdjapan.co.jp", subject })).toBe(expected);
  });

  it.each([
    ["orders@cdjapan.co.jp.attacker.example", "Order Confirmation #73000001"],
    ["orders@fake-cdjapan.co.jp", "Order Update: We Shipped Your Order Today"],
    ["info@cdjapan.jp", "Your Order Is on the Way - And Your Points Are Ready!"],
    ["orders@cdjapan.co.jp", "Order Confirmation #not-a-number"],
    ["orders@cdjapan.co.jp", "Order Update: We Shipped Your Order Today!"]
  ])("rejects an unsupported or lookalike message", (from, subject) => {
    expect(classifyCdJapanHeaders({ from, subject })).toBeNull();
  });
});

describe("CDJapan message parser", () => {
  it("imports every confirmation item and derives a separate additional fee", async () => {
    const result = await parseCdJapanMessage(await fixture("cdjapan-order-confirmation.eml"));

    expect(result).toMatchObject({
      merchant: "cdjapan",
      type: "order_confirmation",
      externalOrderId: "73000001",
      currency: "JPY",
      itemsSubtotal: "5000",
      shippingTotal: "1200",
      additionalFeeTotal: "100",
      shippingMethod: "EMS",
      discountTotal: "800",
      taxTotal: "0",
      total: "5500"
    });
    expect(result?.type).toBe("order_confirmation");
    if (result?.type === "order_confirmation") {
      expect(result.items).toEqual([
        {
          merchantItemId: "SYNTH-001",
          artistName: "Synthetic Artist",
          albumTitle: "Synthetic Album [Limited Release]",
          unitPrice: "3000",
          quantity: 1
        },
        {
          merchantItemId: "SYNTH-002",
          artistName: "未知艺人",
          albumTitle: "Synthetic Compilation [Limited Release]",
          unitPrice: "2000",
          quantity: 1
        }
      ]);
    }
  });

  it.each([
    ["cdjapan-shipment-one.eml", "SYNTH-001", "50b6e6c7c50102680694c582260288458f9d8256dca050fe2638884e484309cd"],
    ["cdjapan-shipment-two.eml", "SYNTH-002", "7f2a41946c57b2a1ccc23493a32590d500adf628d167f47034faa169fc89ef23"]
  ] as const)("parses package items and hashes tracking data from %s", async (name, catalogNumber, packageKey) => {
    const result = await parseCdJapanMessage(await fixture(name));

    expect(result).toMatchObject({
      merchant: "cdjapan",
      type: "shipment",
      externalOrderId: "73000001",
      packageKey,
      itemHints: [catalogNumber],
      shipmentItems: [{ merchantItemId: catalogNumber, quantity: 1 }]
    });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC-TRACK");
    expect(result?.type).toBe("shipment");
    if (result?.type === "shipment") {
      expect(result.items[0]?.productUrl).toBe(`https://www.cdjapan.co.jp/product/${catalogNumber}`);
      expect(result.items[0]?.imageUrl).toBeUndefined();
    }
  });

  it("rejects a subject/body order number mismatch", async () => {
    const source = (await fixture("cdjapan-order-confirmation.eml")).toString("utf8")
      .replace("Order Number : 73000001", "Order Number : 73000002");

    await expect(parseCdJapanMessage(source)).rejects.toThrow(/订单号不一致/);
  });

  it("does not invent a package key when the tracking number is absent", async () => {
    const source = (await fixture("cdjapan-shipment-one.eml")).toString("utf8")
      .replace("Tracking Number:\nSYNTHETIC-TRACK-ONE", "Tracking Number:");

    const result = await parseCdJapanMessage(source);
    expect(result).toMatchObject({ type: "shipment", shipmentItems: [{ merchantItemId: "SYNTH-001", quantity: 1 }] });
    expect(result?.type === "shipment" ? result.packageKey : "not-a-shipment").toBeUndefined();
  });

  it("rejects a lookalike product link inside a supported shipment", async () => {
    const source = (await fixture("cdjapan-shipment-one.eml")).toString("utf8")
      .replace("www.cdjapan.co.jp/product", "www.cdjapan.co.jp.attacker.example/product");

    await expect(parseCdJapanMessage(source)).rejects.toThrow(/链接不可信/);
  });

  it("rejects item and fee totals that cannot reconcile", async () => {
    const source = (await fixture("cdjapan-order-confirmation.eml")).toString("utf8")
      .replace("Subtotal : 5000yen", "Subtotal : 5100yen");

    await expect(parseCdJapanMessage(source)).rejects.toThrow(/商品原价/);
  });
});
