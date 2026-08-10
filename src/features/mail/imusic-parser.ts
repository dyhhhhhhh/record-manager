import { load } from "cheerio";
import { simpleParser, type ParsedMail } from "mailparser";

import { isTrustedImusicCoverUrl } from "@/features/covers/trusted-cover-url";
import {
  mailEventPayloadSchema,
  type MailEventPayload,
  type MailEventType,
  type ParsedOrderItem
} from "@/types/domain";

type HeaderInput = {
  from: string;
  subject: string;
};

const SUBJECT_PATTERNS: Array<[MailEventType, RegExp]> = [
  ["order_confirmation", /^Order Acknowledgment \((\d+)\)$/i],
  ["shipment", /^Your order has been dispatched \(order no\.\s*(\d+)\)$/i],
  ["cancellation", /^Order cancelled \(order no\.\s*(\d+)\)$/i]
];

export function classifyImusicHeaders(headers: HeaderInput): MailEventType | null {
  const address = headers.from.trim().toLocaleLowerCase();
  const domain = address.includes("@") ? address.slice(address.lastIndexOf("@") + 1) : "";

  if (domain !== "imusic.dk" && !domain.endsWith(".imusic.dk")) {
    return null;
  }

  return SUBJECT_PATTERNS.find(([, pattern]) => pattern.test(headers.subject.trim()))?.[0] ?? null;
}

function orderIdFromSubject(subject: string) {
  for (const [, pattern] of SUBJECT_PATTERNS) {
    const match = subject.trim().match(pattern);
    if (match?.[1]) return match[1];
  }
  throw new Error("iMusic 邮件标题中缺少订单 ID");
}

function normalizeMoneyAmount(input: string) {
  const compact = input.replace(/\s/g, "");
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  let decimalSeparator: "," | "." | null = null;

  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else {
    const separatorIndex = Math.max(lastComma, lastDot);
    if (separatorIndex >= 0 && compact.length - separatorIndex - 1 <= 2) {
      decimalSeparator = compact[separatorIndex] as "," | ".";
    }
  }

  if (!decimalSeparator) return compact.replace(/[.,]/g, "");
  const separatorIndex = compact.lastIndexOf(decimalSeparator);
  const whole = compact.slice(0, separatorIndex).replace(/[.,]/g, "") || "0";
  const fraction = compact.slice(separatorIndex + 1).replace(/[.,]/g, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function parsePrice(input: string) {
  const match = input.replace(/\u00a0/g, " ").trim().match(/\b([A-Z]{3})\s+([\d,.]+)/);
  if (!match) throw new Error(`无法解析金额：${input}`);
  return { currency: match[1], amount: normalizeMoneyAmount(match[2]) };
}

function parseItemPrice(input: string) {
  const normalized = input.replace(/\u00a0/g, " ").trim();
  const multiplier = normalized.match(/^(\d+)\s*[×x]\s*/i);
  const price = parsePrice(normalized);
  const quantity = multiplier ? Number(multiplier[1]) : 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error(`无法解析商品数量：${input}`);
  }
  return { ...price, quantity };
}

function textItemHints(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^\d+\s+pc\.\s+(.+)$/i)?.[1])
    .filter((line): line is string => Boolean(line));
}

function parseOrderHtml(html: string) {
  const $ = load(html);
  const items: ParsedOrderItem[] = [];
  let detectedCurrency: string | undefined;

  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    const image = cells.eq(0).find('img[src*="/images/item/"]').first();
    if (!image.length || cells.length < 3) return;

    const details = cells.eq(1);
    const directSpans = details.children("span");
    const titleNode = directSpans.eq(0).clone();
    titleNode.children("span").remove();
    const albumTitle = titleNode.text().replace(/\s+/g, " ").trim();
    const artistName = directSpans.eq(1).text().replace(/\s+/g, " ").trim() || "未知艺人";
    const { currency, amount, quantity } = parseItemPrice(cells.eq(2).text());
    detectedCurrency ??= currency;

    if (currency !== detectedCurrency) {
      throw new Error("同一订单出现了多个币种");
    }

    const imageUrl = image.attr("src");
    items.push({
      albumTitle,
      artistName,
      unitPrice: amount,
      quantity,
      imageUrl: imageUrl && isTrustedImusicCoverUrl(imageUrl) ? imageUrl : undefined
    });
  });

  let billed: ReturnType<typeof parsePrice> | undefined;
  let itemsSubtotal: ReturnType<typeof parsePrice> | undefined;
  let shipping: ReturnType<typeof parsePrice> | undefined;
  let shippingMethod: string | undefined;
  let tax: ReturnType<typeof parsePrice> | undefined;
  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.eq(0).find('img[src*="/images/item/"]').length || cells.length < 3) return;
    const label = cells.eq(1).text().replace(/\s+/g, " ").trim();
    const normalizedLabel = label.toLocaleLowerCase();
    const amountText = cells.eq(2).text().replace(/\s+/g, " ").trim();
    if (!label || !amountText) return;

    if (normalizedLabel === "items total") {
      itemsSubtotal = parsePrice(amountText);
    } else if (normalizedLabel === "amount to be billed") {
      billed = parsePrice(cells.eq(2).text());
    } else if (normalizedLabel.startsWith("of which vat is")) {
      tax = parsePrice(amountText);
    } else if (/\b[A-Z]{3}\s+[\d,.]+/.test(amountText)) {
      shippingMethod = label;
      shipping = parsePrice(amountText);
    }
  });

  if (!items.length) throw new Error("iMusic 下单邮件中未找到商品行");
  if (!itemsSubtotal) throw new Error("iMusic 下单邮件中未找到唱片费用");
  if (!shipping || !shippingMethod) throw new Error("iMusic 下单邮件中未找到配送费用");
  if (!billed) throw new Error("iMusic 下单邮件中未找到实付总额");
  const summaryCurrencies = [itemsSubtotal.currency, shipping.currency, billed.currency, tax?.currency ?? billed.currency];
  if (!detectedCurrency || summaryCurrencies.some((currency) => currency !== detectedCurrency)) {
    throw new Error("商品与费用摘要币种不一致");
  }

  return {
    items,
    currency: billed.currency,
    itemsSubtotal: itemsSubtotal.amount,
    shippingTotal: shipping.amount,
    shippingMethod,
    taxTotal: tax?.amount ?? "0",
    total: billed.amount
  };
}

export async function parseImusicMessage(source: Buffer | string): Promise<MailEventPayload | null> {
  return parseImusicParsedMessage(await simpleParser(source));
}

export function parseImusicParsedMessage(message: ParsedMail): MailEventPayload | null {
  const from = message.from?.value[0]?.address ?? "";
  const subject = message.subject?.trim() ?? "";
  const type = classifyImusicHeaders({ from, subject });
  if (!type) return null;

  if (!message.date || Number.isNaN(message.date.getTime())) {
    throw new Error("iMusic 邮件缺少有效日期");
  }

  const base = {
    merchant: "imusic",
    type,
    externalOrderId: orderIdFromSubject(subject),
    occurredAt: message.date.toISOString()
  } as const;

  if (type === "order_confirmation") {
    if (typeof message.html !== "string") throw new Error("iMusic 下单邮件缺少 HTML 正文");
    const order = parseOrderHtml(message.html);
    return mailEventPayloadSchema.parse({ ...base, ...order });
  }

  const itemHints = textItemHints(message.text ?? "");
  return mailEventPayloadSchema.parse({ ...base, itemHints });
}
