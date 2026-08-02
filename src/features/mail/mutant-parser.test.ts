import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyMutantHeaders, parseMutantMessage } from "@/features/mail/mutant-parser";

const fixturePath = join(process.cwd(), "src/features/mail/fixtures/mutant-order-confirmation.eml");

describe("Mutant order mail", () => {
  it("accepts only the exact trusted confirmation header", () => {
    expect(classifyMutantHeaders({
      from: "synthetic@madebymutant.com",
      fromName: "Mutant",
      replyTo: "",
      subject: "ORDER #51000001 CONFIRMED"
    })).toBe("order_confirmation");
    expect(classifyMutantHeaders({
      from: "synthetic@fake-madebymutant.com",
      fromName: "Mutant",
      replyTo: "",
      subject: "order #51000001 confirmed"
    })).toBeNull();
    expect(classifyMutantHeaders({
      from: "synthetic@madebymutant.com",
      fromName: "Mutant",
      replyTo: "",
      subject: "order #51000001 confirmed — buy more"
    })).toBeNull();
    expect(classifyMutantHeaders({
      from: "synthetic@madebymutant.com",
      fromName: "Mutant",
      replyTo: "",
      subject: "order 51000001 confirmed"
    })).toBeNull();
  });

  it("parses a two-item CNY confirmation", async () => {
    const result = await parseMutantMessage(await readFile(fixturePath));
    expect(result).toMatchObject({
      merchant: "mutant",
      type: "order_confirmation",
      externalOrderId: "51000001",
      currency: "CNY",
      itemsSubtotal: "140.00",
      shippingTotal: "20.00",
      discountTotal: "0",
      total: "160.00"
    });
    expect(result?.type === "order_confirmation" && result.items).toHaveLength(2);
  });

  it("revalidates the From domain from the parsed message", async () => {
    const source = (await readFile(fixturePath, "utf8"))
      .replace("synthetic@madebymutant.com", "synthetic@attacker.example");
    await expect(parseMutantMessage(source)).resolves.toBeNull();
  });
});
