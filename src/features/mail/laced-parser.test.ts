import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyLacedHeaders, parseLacedMessage } from "@/features/mail/laced-parser";

function fixture(name: string) {
  return readFile(join(process.cwd(), "src/features/mail/fixtures", name));
}

describe("Laced Records order mail", () => {
  it("accepts an exact confirmation and rejects similar headers", () => {
    expect(classifyLacedHeaders({
      from: "synthetic@lacedmusic.com",
      fromName: "Laced Records",
      replyTo: "",
      subject: "Order LREU61000001 confirmed"
    })).toBe("order_confirmation");
    expect(classifyLacedHeaders({
      from: "synthetic@fake-lacedmusic.com",
      fromName: "Laced Records",
      replyTo: "",
      subject: "Order LREU61000001 confirmed"
    })).toBeNull();
    expect(classifyLacedHeaders({
      from: "synthetic@lacedmusic.com",
      fromName: "Laced Records",
      replyTo: "",
      subject: "Your Order LREU61000001 confirmed"
    })).toBeNull();
  });

  it.each([
    ["laced-order-confirmation-single.eml", "LREU61000001", 1, "140.00"],
    ["laced-order-confirmation-multiple.eml", "LREU61000002", 2, "210.00"]
  ] as const)("parses confirmation fixture %s", async (name, externalOrderId, itemCount, total) => {
    const result = await parseLacedMessage(await fixture(name));
    expect(result).toMatchObject({
      merchant: "laced",
      type: "order_confirmation",
      externalOrderId,
      currency: "CNY",
      total
    });
    expect(result?.type === "order_confirmation" && result.items).toHaveLength(itemCount);
  });

  it.each([
    ["laced-on-the-way.eml", "A shipment from order LREU61000002 is on the way"],
    ["laced-out-for-delivery.eml", "A shipment from order LREU61000002 is out for delivery"],
    ["laced-delivered.eml", "A shipment from order LREU61000002 has been delivered"]
  ] as const)("normalizes %s to an existing shipment event", async (name, subject) => {
    expect(classifyLacedHeaders({
      from: "synthetic@lacedmusic.com",
      fromName: "Laced Records",
      replyTo: "",
      subject
    })).toBe("shipment");

    const result = await parseLacedMessage(await fixture(name));
    expect(result).toEqual({
      merchant: "laced",
      type: "shipment",
      externalOrderId: "LREU61000002",
      occurredAt: expect.any(String),
      itemHints: ["Synthetic Archive Two × 2", "Synthetic Archive Three × 1"],
      items: []
    });
  });

  it("rejects a near-match logistics subject", () => {
    expect(classifyLacedHeaders({
      from: "synthetic@lacedmusic.com",
      fromName: "Laced Records",
      replyTo: "",
      subject: "A shipment from order LREU61000002 has been delivered — rate us"
    })).toBeNull();
  });
});
