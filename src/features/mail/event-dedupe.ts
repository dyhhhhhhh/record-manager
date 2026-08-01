import type { MailEventType } from "@/types/domain";

export function decideIncomingEvent(input: {
  duplicateMessage: boolean;
  duplicateOrderEvent: boolean;
  type: MailEventType;
  relatedOrderId: string | null;
}) {
  if (input.duplicateMessage || input.duplicateOrderEvent) return "skip" as const;
  if (input.type === "order_confirmation" && input.relatedOrderId) return "archive" as const;
  return "pending" as const;
}
