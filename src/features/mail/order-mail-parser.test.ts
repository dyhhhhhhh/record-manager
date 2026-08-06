import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyOrderHeaders, parseOrderMessage } from "@/features/mail/order-mail-parser";

function fixture(name: string) {
  return readFile(join(process.cwd(), "src/features/mail/fixtures", name));
}

describe("order mail classifier", () => {
  it("returns both merchant and event type", () => {
    expect(classifyOrderHeaders({
      from: "order@imusic.dk",
      fromName: "iMusic",
      replyTo: "",
      subject: "Order Acknowledgment (90000001)"
    }))
      .toEqual({ merchant: "imusic", type: "order_confirmation" });
    expect(classifyOrderHeaders({
      from: "email@hmv.co.jp",
      fromName: "HMV Japan",
      replyTo: "",
      subject: "Cancellation of Your Order"
    }))
      .toEqual({ merchant: "hmv", type: "cancellation" });
  });

  it.each([
    ["mutant-order-confirmation.eml", "mutant", "order_confirmation"],
    ["black-screen-order-confirmation.eml", "black_screen", "order_confirmation"],
    ["black-screen-ready-to-ship.eml", "black_screen", "shipment"],
    ["black-screen-delivered.eml", "black_screen", "shipment"],
    ["laced-order-confirmation-single.eml", "laced", "order_confirmation"],
    ["laced-order-confirmation-multiple.eml", "laced", "order_confirmation"],
    ["laced-on-the-way.eml", "laced", "shipment"],
    ["laced-out-for-delivery.eml", "laced", "shipment"],
    ["laced-delivered.eml", "laced", "shipment"],
    ["cdjapan-order-confirmation.eml", "cdjapan", "order_confirmation"],
    ["cdjapan-shipment-one.eml", "cdjapan", "shipment"]
  ] as const)("routes %s through its trusted merchant adapter", async (name, merchant, type) => {
    expect((await parseOrderMessage(await fixture(name)))?.payload).toMatchObject({ merchant, type });
  });

  it("returns QQ-aligned authentication for automatic status updates", async () => {
    const source = await fixture("laced-delivered.eml");
    const authenticated = Buffer.concat([
      Buffer.from("Authentication-Results: mx.qq.com; dkim=pass header.d=lacedmusic.com\r\n"),
      source
    ]);

    expect(await parseOrderMessage(authenticated)).toMatchObject({
      automaticStatusTrusted: true,
      payload: { merchant: "laced", type: "shipment" }
    });
  });

  it("trusts the authenticated CDJapan shipment fixture for automatic coverage", async () => {
    expect(await parseOrderMessage(await fixture("cdjapan-shipment-one.eml"))).toMatchObject({
      automaticStatusTrusted: true,
      payload: { merchant: "cdjapan", type: "shipment" }
    });
  });

  it("does not classify a Sendcloud message without the store identity and Reply-To", () => {
    expect(classifyOrderHeaders({
      from: "synthetic@sendcloud.com",
      fromName: "Another Store",
      replyTo: "synthetic@attacker.example",
      subject: "Your order #71000001 is delivered"
    })).toBeNull();
  });
});
