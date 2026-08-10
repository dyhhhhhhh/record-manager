import { load } from "cheerio";
import { simpleParser, type ParsedMail } from "mailparser";

import { canonicalizeHmvCoverUrl, canonicalizeHmvProductUrl } from "@/features/covers/trusted-cover-url";
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

const SUBJECTS = new Map<string, MailEventType>([
  ["thank you for your order.", "order_confirmation"],
  ["thank you for your payment of order.", "order_confirmation"],
  ["your order items have been dispatched from our warehouse.", "shipment"],
  ["cancellation of your order", "cancellation"]
]);

export function classifyHmvHeaders(headers: HeaderInput): MailEventType | null {
  const address = headers.from.trim().toLocaleLowerCase();
  const domain = address.includes("@") ? address.slice(address.lastIndexOf("@") + 1) : "";
  if (domain !== "hmv.co.jp" && !domain.endsWith(".hmv.co.jp")) return null;
  return SUBJECTS.get(headers.subject.trim().toLocaleLowerCase()) ?? null;
}

function orderIdFromText(text: string) {
  const match = text.match(/order\s*(?:no\.?|number)\s*[:.]?\s*(\d+)/i);
  if (!match?.[1]) throw new Error("HMV 邮件正文中缺少订单 ID");
  return match[1];
}

function fieldValue(line: string, label: string) {
  const match = line.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "i"));
  return match?.[1]?.trim();
}

function yenAmount(value: string | undefined, label: string) {
  const match = value?.match(/(-)?[^\d]*([\d,]+)/);
  if (!match?.[2]) throw new Error(`HMV 邮件中缺少${label}`);
  return match[2].replaceAll(",", "");
}

function lineAmount(text: string, labelPattern: RegExp, label: string) {
  const line = text.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => labelPattern.test(entry));
  return yenAmount(line?.slice(line.indexOf(":") + 1), label);
}

function parseTextItems(text: string) {
  const items: ParsedOrderItem[] = [];
  let current: Partial<ParsedOrderItem> = {};

  const finish = () => {
    if (!current.albumTitle) return;
    if (!current.unitPrice) throw new Error(`HMV 商品“${current.albumTitle}”缺少单价`);
    items.push({
      albumTitle: current.albumTitle,
      artistName: current.artistName || "未知艺人",
      unitPrice: current.unitPrice,
      quantity: current.quantity ?? 1
    });
    current = {};
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const artistName = fieldValue(line, "Artist");
    const albumTitle = fieldValue(line, "Title");
    if (artistName) {
      if (current.albumTitle) finish();
      current.artistName = artistName;
    } else if (albumTitle) {
      if (current.albumTitle) finish();
      current.albumTitle = albumTitle;
    } else {
      const unitPrice = fieldValue(line, "Unit Price");
      const quantity = fieldValue(line, "Quantity");
      if (unitPrice) current.unitPrice = yenAmount(unitPrice, "商品单价");
      if (quantity) current.quantity = Number(quantity);
    }
  }
  finish();

  if (!items.length) throw new Error("HMV 邮件中未找到商品");
  return items;
}

function comparable(value: string) {
  return value.normalize("NFKC").replace(/[〜～~]/g, "~").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function htmlItemMetadata(html: string) {
  const $ = load(html);
  const coversBySku = new Map<string, string>();
  $("img[src]").each((_, image) => {
    const cover = canonicalizeHmvCoverUrl($(image).attr("src") ?? "");
    if (!cover) return;
    const sku = new URL(cover).searchParams.get("sku");
    if (sku) coversBySku.set(sku, cover);
  });

  const metadata = new Map<string, { label: string; imageUrl?: string; productUrl: string }>();
  $('a[href*="/product/detail/"]').each((_, anchor) => {
    const productUrl = canonicalizeHmvProductUrl($(anchor).attr("href") ?? "");
    if (!productUrl) return;
    const sku = productUrl.slice(productUrl.lastIndexOf("/") + 1);
    const existing = metadata.get(productUrl);
    const label = $(anchor).text().replace(/\s+/g, " ").trim()
      || $(anchor).find("img").attr("alt")?.trim()
      || existing?.label
      || "";
    metadata.set(productUrl, { label, imageUrl: coversBySku.get(sku), productUrl });
  });
  return [...metadata.values()];
}

function attachHtmlMetadata(items: ParsedOrderItem[], html: string) {
  const metadata = htmlItemMetadata(html);
  return items.map((item) => {
    const fullLabel = comparable(`${item.artistName} / ${item.albumTitle}`);
    const title = comparable(item.albumTitle);
    const matches = metadata.filter((entry) => {
      const label = comparable(entry.label);
      return label === fullLabel || label.endsWith(`/ ${title}`) || label === title;
    });
    const match = matches.length === 1 ? matches[0] : undefined;
    return match ? { ...item, imageUrl: match.imageUrl, productUrl: match.productUrl } : item;
  });
}

export async function parseHmvMessage(source: Buffer | string): Promise<MailEventPayload | null> {
  return parseHmvParsedMessage(await simpleParser(source));
}

export function parseHmvParsedMessage(message: ParsedMail): MailEventPayload | null {
  const from = message.from?.value[0]?.address ?? "";
  const subject = message.subject?.trim() ?? "";
  const type = classifyHmvHeaders({ from, subject });
  if (!type) return null;
  if (!message.date || Number.isNaN(message.date.getTime())) throw new Error("HMV 邮件缺少有效日期");

  const text = message.text ?? "";
  const base = {
    merchant: "hmv" as const,
    type,
    externalOrderId: orderIdFromText(text),
    occurredAt: message.date.toISOString()
  };
  const parsedItems = parseTextItems(text);

  if (type === "order_confirmation") {
    const shippingLine = text.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => /^Shipping Option\s*:/i.test(entry));
    const shippingMethod = shippingLine?.slice(shippingLine.indexOf(":") + 1).trim();
    if (!shippingMethod) throw new Error("HMV 下单邮件中缺少配送方式");
    const itemsSubtotal = lineAmount(text, /^Cost of all items\s*:/i, "商品原价");
    const shippingTotal = lineAmount(text, /^Delivery Cost\s*:/i, "运费");
    const total = lineAmount(text, /^Total Cost\s*:/i, "实付总额");
    const discountTotal = (BigInt(itemsSubtotal) + BigInt(shippingTotal) - BigInt(total)).toString();
    return mailEventPayloadSchema.parse({
      ...base,
      currency: "JPY",
      itemsSubtotal,
      shippingTotal,
      shippingMethod,
      discountTotal,
      taxTotal: "0",
      total,
      items: parsedItems
    });
  }

  const items = typeof message.html === "string" ? attachHtmlMetadata(parsedItems, message.html) : parsedItems;
  return mailEventPayloadSchema.parse({
    ...base,
    itemHints: items.map((item) => `${item.artistName} · ${item.albumTitle}`),
    items
  });
}
