import { createHash } from "node:crypto";

import { simpleParser, type ParsedMail } from "mailparser";

import { canonicalizeCdJapanProductUrl } from "@/features/covers/trusted-cover-url";
import { addressDomain } from "@/features/mail/order-mail-adapter";
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

const CONFIRMATION_SUBJECT = /^Order Confirmation #(\d+)$/;
const SHIPMENT_SUBJECT = "Order Update: We Shipped Your Order Today";

export function classifyCdJapanHeaders(headers: HeaderInput): MailEventType | null {
  if (addressDomain(headers.from) !== "cdjapan.co.jp") return null;
  const subject = headers.subject.trim();
  if (CONFIRMATION_SUBJECT.test(subject)) return "order_confirmation";
  if (subject === SHIPMENT_SUBJECT) return "shipment";
  return null;
}

function amountFromLine(text: string, label: string, required = true) {
  const match = text.match(new RegExp(`^${label}\\s*:\\s*(-)?\\s*([\\d,]+)yen\\s*$`, "im"));
  if (!match?.[2]) {
    if (required) throw new Error(`CDJapan 邮件中缺少${label}`);
    return null;
  }
  return match[2].replaceAll(",", "");
}

function bodyOrderId(text: string) {
  const match = text.match(/^Order Number\s*:\s*(\d+)\s*$/im);
  if (!match?.[1]) throw new Error("CDJapan 邮件正文中缺少订单号");
  return match[1];
}

function splitArtistAndTitle(label: string) {
  const separator = label.match(/\s+\/\s+/);
  if (!separator?.index) return { artistName: "未知艺人", albumTitle: label.trim() };
  return {
    artistName: label.slice(0, separator.index).trim() || "未知艺人",
    albumTitle: label.slice(separator.index + separator[0].length).trim()
  };
}

function confirmationItems(text: string) {
  const orderLine = text.search(/^Order Number\s*:/im);
  const paymentLine = text.search(/^Payment Method\s*:/im);
  if (orderLine < 0 || paymentLine <= orderLine) throw new Error("CDJapan 订单确认邮件商品区块不完整");

  const productSection = text.slice(orderLine, paymentLine);
  const items: ParsedOrderItem[] = [];
  for (const block of productSection.split(/^\s*-{10,}\s*$/m)) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const catalogLine = lines.find((line) => /^[A-Z0-9][A-Z0-9._/-]*\s+.+$/.test(line));
    const priceLine = lines.find((line) => /(?:^|\s)([\d,]+)yen\s*$/i.test(line));
    if (!catalogLine || !priceLine) continue;

    const catalogMatch = catalogLine.match(/^([A-Z0-9][A-Z0-9._/-]*)\s+(.+)$/);
    const priceMatch = priceLine.match(/(?:^|\s)([\d,]+)yen\s*$/i);
    if (!catalogMatch?.[1] || !catalogMatch[2] || !priceMatch?.[1]) continue;
    const names = splitArtistAndTitle(catalogMatch[2]);
    items.push({
      merchantItemId: catalogMatch[1],
      ...names,
      unitPrice: priceMatch[1].replaceAll(",", ""),
      quantity: 1
    });
  }
  if (!items.length) throw new Error("CDJapan 订单确认邮件中未找到商品");
  return items;
}

function shipmentTracking(text: string) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => /^Tracking Number\s*:/i.test(line.trim()));
  if (index < 0) return undefined;
  const inlineValue = lines[index]?.slice(lines[index].indexOf(":") + 1).trim() ?? "";
  const followingValue = lines.slice(index + 1).find((line) => line.trim())?.trim() ?? "";
  const tracking = inlineValue || followingValue;
  if (!tracking || /^(?:Order Items|Shipping Address)\s*:/i.test(tracking) || /^-{10,}$/.test(tracking)) {
    return undefined;
  }
  const normalized = tracking.normalize("NFKC").toLocaleUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 6 || normalized === "NOTAVAILABLE") return undefined;
  return createHash("sha256").update(normalized).digest("hex");
}

function shipmentItems(text: string) {
  const sectionStart = /^Order Items\s*:\s*$/im.exec(text);
  if (!sectionStart) throw new Error("CDJapan 发货邮件中缺少商品区块");
  const remaining = text.slice(sectionStart.index + sectionStart[0].length);
  const sectionEnd = remaining.search(/^Shipping Address\s*:/im);
  const section = sectionEnd >= 0 ? remaining.slice(0, sectionEnd) : remaining;

  const items: ParsedOrderItem[] = [];
  for (const block of section.split(/^\s*-{10,}\s*$/m)) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const catalogIndex = lines.findIndex((line) => /^[A-Z0-9][A-Z0-9._/-]*$/.test(line));
    if (catalogIndex < 0) continue;
    const merchantItemId = lines[catalogIndex];
    const label = lines[catalogIndex + 1];
    const detail = lines[catalogIndex + 2];
    if (!merchantItemId || !label || !detail) continue;
    const detailMatch = detail.match(/\b(\d+)\s+([\d,]+)yen\b/i);
    if (!detailMatch?.[1] || !detailMatch[2]) throw new Error(`CDJapan 商品 ${merchantItemId} 缺少数量或单价`);
    const productLine = lines.slice(catalogIndex + 3).find((line) => /^https:\/\//i.test(line));
    const productUrl = productLine ? canonicalizeCdJapanProductUrl(productLine) : null;
    if (productLine && !productUrl) throw new Error(`CDJapan 商品 ${merchantItemId} 的链接不可信`);
    items.push({
      merchantItemId,
      ...splitArtistAndTitle(label),
      unitPrice: detailMatch[2].replaceAll(",", ""),
      quantity: Number(detailMatch[1]),
      ...(productUrl ? { productUrl } : {})
    });
  }
  if (!items.length) throw new Error("CDJapan 发货邮件中未找到商品");
  return items;
}

export async function parseCdJapanMessage(source: Buffer | string): Promise<MailEventPayload | null> {
  return parseCdJapanParsedMessage(await simpleParser(source));
}

export function parseCdJapanParsedMessage(message: ParsedMail): MailEventPayload | null {
  const from = message.from?.value[0]?.address ?? "";
  const subject = message.subject?.trim() ?? "";
  const type = classifyCdJapanHeaders({ from, subject });
  if (!type) return null;
  if (!message.date || Number.isNaN(message.date.getTime())) throw new Error("CDJapan 邮件缺少有效日期");
  const text = message.text ?? "";
  const externalOrderId = bodyOrderId(text);

  if (type === "order_confirmation") {
    const subjectOrderId = subject.match(CONFIRMATION_SUBJECT)?.[1];
    if (!subjectOrderId || subjectOrderId !== externalOrderId) {
      throw new Error("CDJapan 邮件主题与正文订单号不一致");
    }
    const items = confirmationItems(text);
    const itemsSubtotal = amountFromLine(text, "Subtotal")!;
    const shippingTotal = amountFromLine(text, "Shipping")!;
    const points = amountFromLine(text, "Points Redeemed", false) ?? "0";
    const coupon = amountFromLine(text, "Coupon Discount", false) ?? "0";
    const discountTotal = (BigInt(points) + BigInt(coupon)).toString();
    const total = amountFromLine(text, "Total")!;
    const additionalFee = BigInt(total) + BigInt(discountTotal) - BigInt(itemsSubtotal) - BigInt(shippingTotal);
    if (additionalFee < 0n) throw new Error("CDJapan 订单金额无法核对");
    const shippingMethod = text.match(/^Shipping Method\s*:\s*(.+)\s*$/im)?.[1]?.trim();
    if (!shippingMethod) throw new Error("CDJapan 订单确认邮件中缺少配送方式");

    return mailEventPayloadSchema.parse({
      merchant: "cdjapan",
      type,
      externalOrderId,
      occurredAt: message.date.toISOString(),
      currency: "JPY",
      itemsSubtotal,
      shippingTotal,
      additionalFeeTotal: additionalFee.toString(),
      shippingMethod,
      discountTotal,
      taxTotal: amountFromLine(text, "Tax", false) ?? "0",
      total,
      items
    });
  }

  const items = shipmentItems(text);
  const packageKey = shipmentTracking(text);
  return mailEventPayloadSchema.parse({
    merchant: "cdjapan",
    type,
    externalOrderId,
    occurredAt: message.date.toISOString(),
    itemHints: items.map((item) => item.merchantItemId),
    shipmentItems: items.map((item) => ({
      merchantItemId: item.merchantItemId,
      quantity: item.quantity
    })),
    items,
    ...(packageKey ? { packageKey } : {})
  });
}
