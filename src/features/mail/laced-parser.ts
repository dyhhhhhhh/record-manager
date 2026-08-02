import { simpleParser, type ParsedMail } from "mailparser";

import { addressDomain, orderMailHeadersFromParsedMail, type OrderMailHeaders } from "@/features/mail/order-mail-adapter";
import {
  parseShopifyConfirmationHtml,
  parseShopifyShipmentDetails
} from "@/features/mail/shopify-order-parser";
import { mailEventPayloadSchema, type MailEventPayload, type MailEventType } from "@/types/domain";

const CONFIRMATION_SUBJECT = /^Order (LREU\d+) confirmed$/i;
const SHIPMENT_SUBJECTS = [
  /^A shipment from order (LREU\d+) is on the way$/i,
  /^A shipment from order (LREU\d+) is out for delivery$/i,
  /^A shipment from order (LREU\d+) has been delivered$/i
] as const;

export function classifyLacedHeaders(headers: OrderMailHeaders): MailEventType | null {
  if (addressDomain(headers.from) !== "lacedmusic.com") return null;
  const subject = headers.subject.trim();
  if (CONFIRMATION_SUBJECT.test(subject)) return "order_confirmation";
  return SHIPMENT_SUBJECTS.some((pattern) => pattern.test(subject)) ? "shipment" : null;
}

export async function parseLacedMessage(source: Buffer | string): Promise<MailEventPayload | null> {
  return parseLacedParsedMessage(await simpleParser(source));
}

export function parseLacedParsedMessage(message: ParsedMail): MailEventPayload | null {
  const headers = orderMailHeadersFromParsedMail(message);
  const type = classifyLacedHeaders(headers);
  if (!type) return null;
  if (!message.date || Number.isNaN(message.date.getTime())) throw new Error("Laced Records 邮件缺少有效日期");
  const subjectPattern = type === "order_confirmation"
    ? CONFIRMATION_SUBJECT
    : SHIPMENT_SUBJECTS.find((pattern) => pattern.test(headers.subject));
  const externalOrderId = subjectPattern
    ? headers.subject.match(subjectPattern)?.[1]?.toLocaleUpperCase()
    : undefined;
  if (!externalOrderId) throw new Error("Laced Records 邮件标题中缺少订单 ID");

  if (type === "shipment") {
    const details = typeof message.html === "string"
      ? parseShopifyShipmentDetails(message.html, "laced")
      : { itemHints: [], items: [] };
    return mailEventPayloadSchema.parse({
      merchant: "laced",
      type,
      externalOrderId,
      occurredAt: message.date.toISOString(),
      ...details
    });
  }

  if (typeof message.html !== "string") throw new Error("Laced Records 确认邮件缺少 HTML 正文");

  return mailEventPayloadSchema.parse({
    merchant: "laced",
    type: "order_confirmation",
    externalOrderId,
    occurredAt: message.date.toISOString(),
    ...parseShopifyConfirmationHtml(message.html, {
      merchant: "laced",
      shippingFallback: "Laced Records 配送"
    })
  });
}
