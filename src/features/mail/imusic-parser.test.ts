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

  it("extracts a shipment suggestion without applying state", async () => {
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
});
