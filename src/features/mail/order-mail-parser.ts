import { simpleParser } from "mailparser";

import {
  classifyBlackScreenHeaders,
  parseBlackScreenParsedMessage
} from "@/features/mail/black-screen-parser";
import { classifyCdJapanHeaders, parseCdJapanParsedMessage } from "@/features/mail/cdjapan-parser";
import { parseHmvParsedMessage, classifyHmvHeaders } from "@/features/mail/hmv-parser";
import { classifyImusicHeaders, parseImusicParsedMessage } from "@/features/mail/imusic-parser";
import { classifyLacedHeaders, parseLacedParsedMessage } from "@/features/mail/laced-parser";
import { classifyMutantHeaders, parseMutantParsedMessage } from "@/features/mail/mutant-parser";
import {
  orderMailHeadersFromParsedMail,
  type OrderMailAdapter,
  type OrderMailHeaders
} from "@/features/mail/order-mail-adapter";
import { verifyAutomaticStatusSender } from "@/features/mail/mail-authentication";
import type { MailEventPayload, MailEventType, Merchant } from "@/types/domain";

export type ClassifiedOrderMail = { merchant: Merchant; type: MailEventType };

const ORDER_MAIL_ADAPTERS: readonly OrderMailAdapter[] = [
  { merchant: "imusic", classify: classifyImusicHeaders, parse: parseImusicParsedMessage },
  { merchant: "hmv", classify: classifyHmvHeaders, parse: parseHmvParsedMessage },
  { merchant: "mutant", classify: classifyMutantHeaders, parse: parseMutantParsedMessage },
  {
    merchant: "black_screen",
    classify: classifyBlackScreenHeaders,
    parse: parseBlackScreenParsedMessage
  },
  { merchant: "laced", classify: classifyLacedHeaders, parse: parseLacedParsedMessage },
  { merchant: "cdjapan", classify: classifyCdJapanHeaders, parse: parseCdJapanParsedMessage }
];

function classifiedAdapter(headers: OrderMailHeaders) {
  for (const adapter of ORDER_MAIL_ADAPTERS) {
    const type = adapter.classify(headers);
    if (type) return { adapter, classification: { merchant: adapter.merchant, type } };
  }
  return null;
}

export function classifyOrderHeaders(headers: OrderMailHeaders): ClassifiedOrderMail | null {
  return classifiedAdapter(headers)?.classification ?? null;
}

export type ParsedOrderMessage = {
  payload: MailEventPayload;
  automaticStatusTrusted: boolean;
  trustWarning?: string;
};

export async function parseOrderMessage(source: Buffer | string): Promise<ParsedOrderMessage | null> {
  const message = await simpleParser(source);
  const classified = classifiedAdapter(orderMailHeadersFromParsedMail(message));
  if (!classified) return null;
  const payload = classified.adapter.parse(message);
  if (!payload) return null;
  const authentication = verifyAutomaticStatusSender(message.headerLines, classified.classification);
  return {
    payload,
    automaticStatusTrusted: authentication.trusted,
    ...(authentication.warning ? { trustWarning: authentication.warning } : {})
  };
}
