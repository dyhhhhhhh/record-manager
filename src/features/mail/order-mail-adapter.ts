import type { ParsedMail } from "mailparser";

import type { MailEventPayload, MailEventType, Merchant } from "@/types/domain";

export type OrderMailHeaders = {
  from: string;
  fromName: string;
  replyTo: string;
  subject: string;
};

export type OrderMailAdapter = {
  merchant: Merchant;
  classify(headers: OrderMailHeaders): MailEventType | null;
  parse(message: ParsedMail): MailEventPayload | null;
};

export function addressDomain(address: string) {
  const normalized = address.trim().toLocaleLowerCase();
  const separator = normalized.lastIndexOf("@");
  return separator >= 0 ? normalized.slice(separator + 1) : "";
}

export function orderMailHeadersFromParsedMail(message: ParsedMail): OrderMailHeaders {
  return {
    from: message.from?.value[0]?.address ?? "",
    fromName: message.from?.value[0]?.name?.trim() ?? "",
    replyTo: message.replyTo?.value[0]?.address ?? "",
    subject: message.subject?.trim() ?? ""
  };
}
