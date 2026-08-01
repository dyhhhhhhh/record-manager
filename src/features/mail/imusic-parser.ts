import { load } from "cheerio";
import { simpleParser } from "mailparser";

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

function parsePrice(input: string) {
  const match = input.replace(/\u00a0/g, " ").trim().match(/\b([A-Z]{3})\s+([\d,.]+)/);
  if (!match) throw new Error(`无法解析金额：${input}`);
  return { currency: match[1], amount: match[2].replaceAll(",", "") };
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
    const artistName = directSpans.eq(1).text().replace(/\s+/g, " ").trim();
    const { currency, amount } = parsePrice(cells.eq(2).text());
    detectedCurrency ??= currency;

    if (currency !== detectedCurrency) {
      throw new Error("同一订单出现了多个币种");
    }

    const imageUrl = image.attr("src");
    items.push({
      albumTitle,
      artistName,
      unitPrice: amount,
      quantity: 1,
      imageUrl: imageUrl && isTrustedImusicCoverUrl(imageUrl) ? imageUrl : undefined
    });
  });

  let billed: ReturnType<typeof parsePrice> | undefined;
  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.eq(1).text().replace(/\s+/g, " ").trim().toLocaleLowerCase() === "amount to be billed") {
      billed = parsePrice(cells.eq(2).text());
    }
  });

  if (!items.length) throw new Error("iMusic 下单邮件中未找到商品行");
  if (!billed) throw new Error("iMusic 下单邮件中未找到实付总额");
  if (detectedCurrency !== billed.currency) throw new Error("商品与实付总额币种不一致");

  return { items, currency: billed.currency, total: billed.amount };
}

export async function parseImusicMessage(source: Buffer | string): Promise<MailEventPayload | null> {
  const message = await simpleParser(source);
  const from = message.from?.value[0]?.address ?? "";
  const subject = message.subject?.trim() ?? "";
  const type = classifyImusicHeaders({ from, subject });
  if (!type) return null;

  if (!message.date || Number.isNaN(message.date.getTime())) {
    throw new Error("iMusic 邮件缺少有效日期");
  }

  const base = {
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
