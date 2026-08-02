import type { MailEventStatus, MailEventType, Merchant } from "@/types/domain";

export function externalOrderIdFromSubject(merchant: Merchant, subject: string) {
  if (merchant === "laced") {
    return subject.match(/\bLREU\d+\b/i)?.[0]?.toLocaleUpperCase() ?? null;
  }
  return subject.match(/\d+/)?.[0] ?? null;
}

export function resolveReprocessedEventStatus(
  existingStatus: MailEventStatus,
  incomingStatus: MailEventStatus
) {
  return existingStatus === "applied" || existingStatus === "ignored"
    ? existingStatus
    : incomingStatus;
}

export function decideIncomingEvent(input: {
  duplicateMessage: boolean;
  duplicateOrderEvent: boolean;
  type: MailEventType;
  relatedOrderId: string | null;
  status: MailEventStatus;
  automaticStatusTrusted: boolean;
}) {
  if (input.duplicateMessage || input.duplicateOrderEvent) return "skip" as const;
  if (input.status !== "pending") return "store" as const;
  if (input.type === "order_confirmation" && input.relatedOrderId) return "archive" as const;
  if (input.type !== "order_confirmation" && input.automaticStatusTrusted) return "auto_apply" as const;
  return "store" as const;
}
