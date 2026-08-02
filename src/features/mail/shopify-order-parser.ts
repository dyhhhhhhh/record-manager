import { load } from "cheerio";

import {
  canonicalizeShopifyCoverUrl,
  canonicalizeStoreProductUrl
} from "@/features/covers/trusted-cover-url";
import {
  combineProductAndVariant,
  divideLineTotal,
  parseLocalizedMoney
} from "@/features/mail/store-mail-utils";
import { orderAccountingErrors, type ParsedOrderItem } from "@/types/domain";

type ShopifyMerchant = "mutant" | "laced";

type ShopifyConfirmationConfig = {
  merchant: ShopifyMerchant;
  shippingFallback: "Mutant 配送" | "Laced Records 配送";
};

type ShopifyConfirmationDetails = {
  currency: string;
  itemsSubtotal: string;
  shippingTotal: string;
  shippingMethod: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  items: ParsedOrderItem[];
};

function normalizedText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseTitleAndQuantity(value: string) {
  const match = normalizedText(value).match(/^(.+?)\s*×\s*(\d+)$/u);
  if (!match?.[1] || !match[2]) throw new Error("Shopify 商品行缺少名称或数量");
  const quantity = Number(match[2]);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Shopify 商品数量无效");
  return { title: match[1].trim(), quantity };
}

function summaryRows(html: string) {
  const $ = load(html);
  const summaries = new Map<string, string[]>();
  $(".subtotal-line").each((_, row) => {
    const label = normalizedText($(row).find(".subtotal-line__title").text()).toLocaleLowerCase();
    const value = normalizedText($(row).find(".subtotal-line__value").text());
    if (!label || !value) return;
    summaries.set(label, [...(summaries.get(label) ?? []), value]);
  });
  return summaries;
}

function oneSummary(summaries: Map<string, string[]>, label: string, required = true) {
  const values = summaries.get(label) ?? [];
  if (values.length > 1) throw new Error(`Shopify 费用摘要出现多个 ${label}`);
  if (!values.length && required) throw new Error(`Shopify 费用摘要缺少 ${label}`);
  return values[0];
}

export function parseShopifyConfirmationHtml(
  html: string,
  config: ShopifyConfirmationConfig
): ShopifyConfirmationDetails {
  const $ = load(html);
  const items: ParsedOrderItem[] = [];

  $(".order-list__item").each((_, row) => {
    const { title, quantity } = parseTitleAndQuantity($(row).find(".order-list__item-title").first().text());
    const variant = normalizedText($(row).find(".order-list__item-variant").first().text());
    const lineTotal = parseLocalizedMoney($(row).find(".order-list__item-price").first().text());
    const imageUrl = canonicalizeShopifyCoverUrl(
      $(row).find(".order-list__product-image").first().attr("src") ?? ""
    ) ?? undefined;
    const productUrl = $(row).find("a[href]").toArray()
      .map((anchor) => canonicalizeStoreProductUrl($(anchor).attr("href") ?? "", config.merchant))
      .find((value): value is string => Boolean(value));

    items.push({
      albumTitle: combineProductAndVariant(title, variant),
      artistName: "未知艺人",
      unitPrice: divideLineTotal(lineTotal, quantity),
      quantity,
      imageUrl,
      productUrl
    });
  });
  if (!items.length) throw new Error("Shopify 确认邮件中未找到商品行");

  const summaries = summaryRows(html);
  const subtotalText = oneSummary(summaries, "subtotal") as string;
  const shippingText = oneSummary(summaries, "shipping") as string;
  const totalText = oneSummary(summaries, "total") as string;
  const totalCurrency = totalText.match(/\b([A-Z]{3})\b/)?.[1];
  if (!totalCurrency) throw new Error("Shopify 确认邮件总额中缺少 ISO 币种");
  const summaryCurrencies = [...summaries.values()].flat()
    .flatMap((value) => value.match(/\b([A-Z]{3})\b/)?.[1] ?? []);
  if (summaryCurrencies.some((currency) => currency !== totalCurrency)) {
    throw new Error("Shopify 费用摘要币种不一致");
  }

  const discountText = oneSummary(summaries, "discount", false);
  const taxText = oneSummary(summaries, "taxes", false);
  const details: ShopifyConfirmationDetails = {
    currency: totalCurrency,
    itemsSubtotal: parseLocalizedMoney(subtotalText),
    shippingTotal: parseLocalizedMoney(shippingText),
    shippingMethod: config.shippingFallback,
    discountTotal: discountText ? parseLocalizedMoney(discountText.replace(/^\s*-\s*/, "")) : "0",
    taxTotal: taxText ? parseLocalizedMoney(taxText) : "0",
    total: parseLocalizedMoney(totalText),
    items
  };

  const errors = orderAccountingErrors(details);
  if (errors.length) throw new Error(errors.join("；"));
  return details;
}

export function parseShopifyShipmentDetails(html: string, merchant: "laced") {
  const $ = load(html);
  const items: ParsedOrderItem[] = [];
  const itemHints: string[] = [];

  $(".order-list__item").each((_, row) => {
    const { title, quantity } = parseTitleAndQuantity($(row).find(".order-list__item-title").first().text());
    const variant = normalizedText($(row).find(".order-list__item-variant").first().text());
    const albumTitle = combineProductAndVariant(title, variant);
    itemHints.push(`${albumTitle} × ${quantity}`);

    const priceText = normalizedText($(row).find(".order-list__item-price").first().text());
    if (!priceText) return;
    const imageUrl = canonicalizeShopifyCoverUrl(
      $(row).find(".order-list__product-image").first().attr("src") ?? ""
    ) ?? undefined;
    const productUrl = $(row).find("a[href]").toArray()
      .map((anchor) => canonicalizeStoreProductUrl($(anchor).attr("href") ?? "", merchant))
      .find((value): value is string => Boolean(value));
    items.push({
      albumTitle,
      artistName: "未知艺人",
      unitPrice: divideLineTotal(parseLocalizedMoney(priceText), quantity),
      quantity,
      imageUrl,
      productUrl
    });
  });

  return { itemHints, items };
}
