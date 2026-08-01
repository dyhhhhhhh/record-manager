import type { MailEventStatus, MailEventType } from "@/types/domain";

export type MailEventListRow = {
  id: string;
  event_type: MailEventType;
  status: MailEventStatus;
  external_order_id: string | null;
  subject: string;
  sender: string;
  received_at: string;
  parse_errors: unknown;
  related_order_id: string | null;
};

export type MailEventGroup = {
  key: string;
  externalOrderId: string | null;
  events: MailEventListRow[];
  latestReceivedAt: string;
  primaryEventId: string;
  view: "pending" | "processed";
};

export function isMailEventStatusActionable(status: MailEventStatus) {
  return status === "pending" || status === "failed";
}

const isActionable = (event: MailEventListRow) => isMailEventStatusActionable(event.status);

export function groupMailEvents(events: MailEventListRow[]): MailEventGroup[] {
  const grouped = new Map<string, MailEventListRow[]>();

  for (const event of events) {
    const key = event.external_order_id ? `order:${event.external_order_id}` : `event:${event.id}`;
    const existing = grouped.get(key) ?? [];
    existing.push(event);
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .map(([key, groupEvents]) => {
      const sortedEvents = [...groupEvents].sort((left, right) =>
        right.received_at.localeCompare(left.received_at)
      );
      const primary = sortedEvents.find((event) =>
        event.event_type === "order_confirmation" && isActionable(event)
      ) ?? sortedEvents.find(isActionable) ?? sortedEvents[0];
      return {
        key,
        externalOrderId: sortedEvents[0].external_order_id,
        events: sortedEvents,
        latestReceivedAt: sortedEvents[0].received_at,
        primaryEventId: primary.id,
        view: sortedEvents.some(isActionable) ? "pending" as const : "processed" as const
      };
    })
    .sort((left, right) => right.latestReceivedAt.localeCompare(left.latestReceivedAt));
}

export function filterMailEventGroups(
  groups: MailEventGroup[],
  view: "pending" | "processed"
) {
  return groups.filter((group) => group.view === view);
}
