import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyImusicHeaders, parseImusicMessage } from "@/features/mail/imusic-parser";

const fixture = (name: string) => readFile(join(process.cwd(), "src/features/mail/fixtures", name));

describe("iMusic mail classifier", () => {
  it.each([
    ["Order Acknowledgment (90000001)", "order_confirmation"],
    ["Your order has been dispatched (order no. 90000002)", "shipment"],
    ["Order cancelled (order no. 90000003)", "cancellation"]
  ] as const)("classifies %s", (subject, expected) => {
    expect(classifyImusicHeaders({ from: "order@imusic.dk", subject })).toBe(expected);
  });

  it("rejects marketing mail and lookalike sender domains", () => {
    expect(classifyImusicHeaders({ from: "news@imusic.dk", subject: "This week in vinyl" })).toBeNull();
    expect(classifyImusicHeaders({ from: "order@fake-imusic.dk", subject: "Order Acknowledgment (1)" })).toBeNull();
  });
});

describe("iMusic message parser", () => {
  it("extracts order totals, records, artists, prices and covers from HTML", async () => {
    const result = await parseImusicMessage(await fixture("order-acknowledgment.eml"));

    expect(result).toMatchObject({
      type: "order_confirmation",
      externalOrderId: "90000001",
      currency: "CNY",
      itemsSubtotal: "430.00",
      shippingTotal: "98.00",
      shippingMethod: "FedEx International",
      taxTotal: "0",
      total: "528.00",
      items: [
        {
          albumTitle: "Example Album (LP) (2026) [Blue Vinyl edition]",
          artistName: "Example Artist",
          unitPrice: "248.00",
          quantity: 1,
          imageUrl: "https://imusic.b-cdn.net/images/item/original/010/0000000000010.jpg?class=scaled"
        },
        {
          albumTitle: "Second Record (LP) (2025)",
          artistName: "Second Artist",
          unitPrice: "182.00",
          quantity: 1
        }
      ]
    });
  });

  it("extracts PostNord shipping and included VAT without adding tax to the billed total", async () => {
    const source = (await fixture("order-acknowledgment.eml"))
      .toString("utf8")
      .replace("FedEx International", "PostNord Tracked")
      .replace(
        '<tr><td></td><td>Amount to be billed</td><td align="right">CNY 528.00</td></tr>',
        '<tr><td></td><td>Amount to be billed</td><td align="right">CNY 528.00</td></tr>'
          + '<tr><td></td><td>of which VAT is (6% of CNY 100.00)</td><td align="right">CNY 6.00</td></tr>'
      );

    await expect(parseImusicMessage(source)).resolves.toMatchObject({
      type: "order_confirmation",
      currency: "CNY",
      itemsSubtotal: "430.00",
      shippingTotal: "98.00",
      shippingMethod: "PostNord Tracked",
      taxTotal: "6.00",
      total: "528.00"
    });
  });

  it("normalizes European decimal separators used by CNY order emails", async () => {
    const source = (await fixture("order-acknowledgment.eml"))
      .toString("utf8")
      .replaceAll("CNY 248.00", "CNY 747,00")
      .replaceAll("CNY 182.00", "CNY 208,00")
      .replaceAll("CNY 528.00", "CNY 1.053,00");

    await expect(parseImusicMessage(source)).resolves.toMatchObject({
      type: "order_confirmation",
      currency: "CNY",
      total: "1053.00",
      items: [{ unitPrice: "747.00" }, { unitPrice: "208.00" }]
    });
  });

  it("keeps an editable placeholder when iMusic omits an item artist", async () => {
    const source = (await fixture("order-acknowledgment.eml"))
      .toString("utf8")
      .replace("<span>Second Artist</span>", "<span></span>");

    const result = await parseImusicMessage(source);

    expect(result?.type).toBe("order_confirmation");
    if (result?.type === "order_confirmation") {
      expect(result.items[1].artistName).toBe("未知艺人");
    }
  });

  it("extracts a shipment status event", async () => {
    await expect(parseImusicMessage(await fixture("order-dispatched.eml"))).resolves.toMatchObject({
      type: "shipment",
      externalOrderId: "90000002"
    });
  });

  it("extracts cancellation item hints", async () => {
    await expect(parseImusicMessage(await fixture("order-cancelled.eml"))).resolves.toMatchObject({
      type: "cancellation",
      externalOrderId: "90000003",
      itemHints: ["Example Artist · Example Album (LP) (2026)", "Second Artist · Second Record (LP) (2025)"]
    });
  });

  it("returns null for non-order mail", async () => {
    await expect(parseImusicMessage(await fixture("marketing.eml"))).resolves.toBeNull();
  });

  it("drops cover URLs hosted outside the trusted iMusic CDN", async () => {
    const source = (await fixture("order-acknowledgment.eml"))
      .toString("utf8")
      .replaceAll("https://imusic.b-cdn.net", "https://attacker.example");
    const result = await parseImusicMessage(source);

    expect(result?.type).toBe("order_confirmation");
    if (result?.type === "order_confirmation") {
      expect(result.items.every((item) => item.imageUrl === undefined)).toBe(true);
    }
  });
});
