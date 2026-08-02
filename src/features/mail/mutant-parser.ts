import { simpleParser, type ParsedMail } from "mailparser";

import { addressDomain, orderMailHeadersFromParsedMail, type OrderMailHeaders } from "@/features/mail/order-mail-adapter";
import { parseShopifyConfirmationHtml } from "@/features/mail/shopify-order-parser";
import { mailEventPayloadSchema, type MailEventPayload, type MailEventType } from "@/types/domain";

const SUBJECT_PATTERN = /^order #(\d+) confirmed$/i;

export function classifyMutantHeaders(headers: OrderMailHeaders): MailEventType | null {
  return addressDomain(headers.from) === "madebymutant.com" && SUBJECT_PATTERN.test(headers.subject.trim())
    ? "order_confirmation"
    : null;
}

export async function parseMutantMessage(source: Buffer | string): Promise<MailEventPayload | null> {
  return parseMutantParsedMessage(await simpleParser(source));
}

export function parseMutantParsedMessage(message: ParsedMail): MailEventPayload | null {
  const headers = orderMailHeadersFromParsedMail(message);
  if (!classifyMutantHeaders(headers)) return null;
  if (!message.date || Number.isNaN(message.date.getTime())) throw new Error("Mutant 邮件缺少有效日期");
  if (typeof message.html !== "string") throw new Error("Mutant 确认邮件缺少 HTML 正文");
  const externalOrderId = headers.subject.match(SUBJECT_PATTERN)?.[1];
  if (!externalOrderId) throw new Error("Mutant 邮件标题中缺少订单 ID");

  return mailEventPayloadSchema.parse({
    merchant: "mutant",
    type: "order_confirmation",
    externalOrderId,
    occurredAt: message.date.toISOString(),
    ...parseShopifyConfirmationHtml(message.html, {
      merchant: "mutant",
      shippingFallback: "Mutant 配送"
    })
  });
}
