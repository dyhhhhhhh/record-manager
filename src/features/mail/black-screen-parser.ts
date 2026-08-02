import { load } from "cheerio";
import { simpleParser, type ParsedMail } from "mailparser";

import {
  canonicalizeShopifyCoverUrl,
  canonicalizeStoreProductUrl
} from "@/features/covers/trusted-cover-url";
import {
  addressDomain,
  orderMailHeadersFromParsedMail,
  type OrderMailHeaders
} from "@/features/mail/order-mail-adapter";
import { divideLineTotal, parseLocalizedMoney } from "@/features/mail/store-mail-utils";
import {
  mailEventPayloadSchema,
  orderAccountingErrors,
  type MailEventPayload,
  type MailEventType,
  type ParsedOrderItem
} from "@/types/domain";

const CONFIRMATION_SUBJECT = /^Order #(\d+) confirmed$/i;
const SHIPMENT_SUBJECTS = [
  /^Your order #(\d+) is ready to be shipped$/i,
  /^Your order #(\d+) is delivered$/i
] as const;

export function classifyBlackScreenHeaders(headers: OrderMailHeaders): MailEventType | null {
  const subject = headers.subject.trim();
  if (addressDomain(headers.from) === "blackscreenrecords.com" && CONFIRMATION_SUBJECT.test(subject)) {
    return "order_confirmation";
  }
  const trustedSendcloud = addressDomain(headers.from) === "sendcloud.com"
    && headers.fromName === "Black Screen Records"
    && addressDomain(headers.replyTo) === "blackscreenrecords.com";
  return trustedSendcloud && SHIPMENT_SUBJECTS.some((pattern) => pattern.test(subject))
    ? "shipment"
    : null;
}

function normalizedText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseEuro(value: string, label: string) {
  if (!/€|\bEUR\b/i.test(value)) throw new Error(`Black Screen Records ${label}缺少 EUR 币种`);
  return parseLocalizedMoney(value.replace(/^\s*-\s*/, ""));
}

function toMinorUnits(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromMinorUnits(value: bigint) {
  if (value < 0n) throw new Error("Black Screen Records 已含税费不能为负数");
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function parseOrderlyConfirmation(html: string) {
  const $ = load(html);
  const items: ParsedOrderItem[] = [];
  $(".line-item-description").each((_, description) => {
    const row = $(description).closest("tr");
    const albumTitle = normalizedText($(description).find("p").first().text() || $(description).text());
    const quantityText = normalizedText(row.find(".line-item-qty").first().text());
    const quantity = Number(quantityText.match(/[x×]\s*(\d+)/i)?.[1]);
    if (!albumTitle) throw new Error("Black Screen Records 商品行缺少名称");
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Black Screen Records 商品行缺少数量");
    const lineTotal = parseEuro(row.find(".line-item-line-price").first().text(), "商品金额");
    const imageUrl = canonicalizeShopifyCoverUrl(row.find(".product-image").first().attr("src") ?? "") ?? undefined;
    const productUrl = row.find("a[href]").toArray()
      .map((anchor) => canonicalizeStoreProductUrl($(anchor).attr("href") ?? "", "black_screen"))
      .find((value): value is string => Boolean(value));
    items.push({
      albumTitle,
      artistName: "未知艺人",
      unitPrice: divideLineTotal(lineTotal, quantity),
      quantity,
      imageUrl,
      productUrl
    });
  });
  if (!items.length) throw new Error("Black Screen Records 确认邮件中未找到商品行");

  const rows = $(".pricing-table").first().find("tr").toArray().map((row) => ({
    label: normalizedText($(row).find(".table-title").first().text()),
    value: normalizedText($(row).find(".table-text").first().text())
  })).filter((row) => row.label && row.value);
  const byLabel = (label: string) => rows.find((row) => row.label.toLocaleLowerCase() === label)?.value;
  const subtotalText = byLabel("subtotal");
  const totalText = byLabel("total");
  if (!subtotalText || !totalText) throw new Error("Black Screen Records 邮件缺少费用摘要");

  const reservedLabels = /^(subtotal|discount|tax|taxes|vat|total(?:\s+excl\.?\s+tax)?)$/i;
  const shipping = rows.find((row) => !reservedLabels.test(row.label));
  if (!shipping) throw new Error("Black Screen Records 邮件缺少运费");
  const itemsSubtotal = parseEuro(subtotalText, "商品原价");
  const shippingTotal = parseEuro(shipping.value, "运费");
  const total = parseEuro(totalText, "实付总额");
  const discountText = byLabel("discount");
  const totalExcludingTax = rows.find((row) => /^total\s+excl\.?\s+tax$/i.test(row.label));
  const explicitTax = rows.find((row) => /^(tax|taxes|vat)$/i.test(row.label));
  const taxTotal = explicitTax
    ? parseEuro(explicitTax.value, "税费")
    : totalExcludingTax
      ? fromMinorUnits(toMinorUnits(total) - toMinorUnits(parseEuro(totalExcludingTax.value, "未税总额")))
      : "0";
  const result = {
    currency: "EUR",
    itemsSubtotal,
    shippingTotal,
    shippingMethod: shipping.label.toLocaleLowerCase() === "shipping"
      ? "Black Screen Records 配送"
      : shipping.label,
    discountTotal: discountText ? parseEuro(discountText, "优惠") : "0",
    taxTotal,
    total,
    items
  };
  const errors = orderAccountingErrors(result);
  if (errors.length) throw new Error(errors.join("；"));
  return result;
}

export async function parseBlackScreenMessage(source: Buffer | string): Promise<MailEventPayload | null> {
  return parseBlackScreenParsedMessage(await simpleParser(source));
}

export function parseBlackScreenParsedMessage(message: ParsedMail): MailEventPayload | null {
  const headers = orderMailHeadersFromParsedMail(message);
  const type = classifyBlackScreenHeaders(headers);
  if (!type) return null;
  if (!message.date || Number.isNaN(message.date.getTime())) {
    throw new Error("Black Screen Records 邮件缺少有效日期");
  }
  const pattern = type === "order_confirmation"
    ? CONFIRMATION_SUBJECT
    : SHIPMENT_SUBJECTS.find((candidate) => candidate.test(headers.subject));
  const externalOrderId = pattern ? headers.subject.match(pattern)?.[1] : undefined;
  if (!externalOrderId) throw new Error("Black Screen Records 邮件标题中缺少订单 ID");
  const base = {
    merchant: "black_screen" as const,
    type,
    externalOrderId,
    occurredAt: message.date.toISOString()
  };

  if (type === "shipment") {
    return mailEventPayloadSchema.parse({ ...base, itemHints: [], items: [] });
  }
  if (typeof message.html !== "string") throw new Error("Black Screen Records 确认邮件缺少 HTML 正文");
  return mailEventPayloadSchema.parse({ ...base, ...parseOrderlyConfirmation(message.html) });
}
