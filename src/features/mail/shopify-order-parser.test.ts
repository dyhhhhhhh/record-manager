import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseShopifyConfirmationHtml } from "@/features/mail/shopify-order-parser";

async function fixture(name: string) {
  const source = await readFile(join(process.cwd(), "src/features/mail/fixtures", name), "utf8");
  return source.slice(source.indexOf("<!doctype html>"));
}

describe("Shopify order extraction", () => {
  it("extracts exact line-unit amounts and row-local metadata", async () => {
    const result = parseShopifyConfirmationHtml(
      await fixture("mutant-order-confirmation.eml"),
      { merchant: "mutant", shippingFallback: "Mutant 配送" }
    );

    expect(result).toMatchObject({
      currency: "CNY",
      itemsSubtotal: "140.00",
      shippingTotal: "20.00",
      shippingMethod: "Mutant 配送",
      discountTotal: "0",
      taxTotal: "0.00",
      total: "160.00"
    });
    expect(result.items).toEqual([
      {
        albumTitle: "Synthetic Score Alpha · Translucent Red",
        artistName: "未知艺人",
        unitPrice: "40.00",
        quantity: 2,
        imageUrl: "https://cdn.shopify.com/s/files/1/0000/0001/files/synthetic-score-alpha.jpg?v=1",
        productUrl: "https://madebymutant.com/products/synthetic-score-alpha"
      },
      {
        albumTitle: "Synthetic Score Beta",
        artistName: "未知艺人",
        unitPrice: "60.00",
        quantity: 1,
        imageUrl: "https://cdn.shopify.com/s/files/1/0000/0001/files/synthetic-score-beta.jpg?v=1",
        productUrl: "https://madebymutant.com/products/synthetic-score-beta"
      }
    ]);
  });

  it("imports every Laced product and handles a discount row", async () => {
    const single = parseShopifyConfirmationHtml(
      await fixture("laced-order-confirmation-single.eml"),
      { merchant: "laced", shippingFallback: "Laced Records 配送" }
    );
    const multiple = parseShopifyConfirmationHtml(
      await fixture("laced-order-confirmation-multiple.eml"),
      { merchant: "laced", shippingFallback: "Laced Records 配送" }
    );

    expect(single).toMatchObject({
      itemsSubtotal: "120.00",
      shippingTotal: "25.00",
      discountTotal: "5.00",
      total: "140.00"
    });
    expect(single.items[0].albumTitle).toBe("Synthetic Archive One");
    expect(multiple.items).toMatchObject([
      { albumTitle: "Synthetic Archive Two", quantity: 2, unitPrice: "50.00" },
      { albumTitle: "Synthetic Archive Three", quantity: 1, unitPrice: "80.00" }
    ]);
  });

  it("drops non-row and attacker-hosted product media", async () => {
    const html = (await fixture("mutant-order-confirmation.eml"))
      .replaceAll("https://cdn.shopify.com/s/files/1/0000/0001/files/", "https://attacker.example/")
      .replaceAll("https://madebymutant.com/products/", "https://madebymutant.com.attacker.example/products/");

    const result = parseShopifyConfirmationHtml(html, {
      merchant: "mutant",
      shippingFallback: "Mutant 配送"
    });

    expect(result.items.every((item) => !item.imageUrl && !item.productUrl)).toBe(true);
  });

  it("rejects missing currency, imprecise units, and inconsistent totals", async () => {
    const html = await fixture("mutant-order-confirmation.eml");
    expect(() => parseShopifyConfirmationHtml(html.replace(" CNY", ""), {
      merchant: "mutant",
      shippingFallback: "Mutant 配送"
    })).toThrow(/币种/);

    expect(() => parseShopifyConfirmationHtml(
      html.replace("¥80.00", "¥80.01").replace("¥140.00", "¥140.01").replace("¥160.00", "¥160.01"),
      { merchant: "mutant", shippingFallback: "Mutant 配送" }
    )).toThrow(/精确换算单价/);

    expect(() => parseShopifyConfirmationHtml(html.replace("¥160.00", "¥159.00"), {
      merchant: "mutant",
      shippingFallback: "Mutant 配送"
    })).toThrow(/实付/);
  });

  it("rejects a confirmation without product rows", async () => {
    const html = (await fixture("mutant-order-confirmation.eml"))
      .replaceAll("order-list__item", "not-an-order-item");
    expect(() => parseShopifyConfirmationHtml(html, {
      merchant: "mutant",
      shippingFallback: "Mutant 配送"
    })).toThrow(/商品/);
  });
});
