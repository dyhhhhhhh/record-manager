import {
  mailEventPayloadSchema,
  type FulfillmentStatus,
  type MailEventStatus,
  type MailEventType,
  type OrderConfirmationPayload
} from "@/types/domain";

export type UnifiedOrderState = "pending_import" | FulfillmentStatus | "cancelled" | "failed";

export type UnifiedMailEvent = {
  id: string;
  event_type: MailEventType;
  status: MailEventStatus;
  external_order_id: string | null;
  received_at: string;
  parsed_payload: unknown;
  parse_errors: unknown;
  related_order_id: string | null;
};

export type UnifiedStoredOrder = {
  id: string;
  external_order_id: string;
  ordered_at: string;
  currency: string;
  effective_total: string;
  fulfillment_status: FulfillmentStatus;
  cancelled_at: string | null;
  order_items: Array<{
    id: string;
    album_title: string;
    artist_name: string;
    cancelled_at: string | null;
  }>;
};

export type UnifiedOrderRow = {
  externalOrderId: string;
  orderId: string | null;
  confirmationEventId: string | null;
  orderedAt: string;
  currency: string | null;
  total: string | null;
  state: UnifiedOrderState;
  canImport: boolean;
  items: Array<{ albumTitle: string; artistName: string; cancelledAt: string | null }>;
  payload: OrderConfirmationPayload | null;
  events: UnifiedMailEvent[];
};

export function buildUnifiedOrderRows(
  events: UnifiedMailEvent[],
  orders: UnifiedStoredOrder[]
): UnifiedOrderRow[] {
  const eventsByOrderId = new Map<string, UnifiedMailEvent[]>();
  for (const event of events) {
    if (!event.external_order_id) continue;
    const grouped = eventsByOrderId.get(event.external_order_id) ?? [];
    grouped.push(event);
    eventsByOrderId.set(event.external_order_id, grouped);
  }

  const ordersByExternalId = new Map(orders.map((order) => [order.external_order_id, order]));
  const externalOrderIds = new Set([...eventsByOrderId.keys(), ...ordersByExternalId.keys()]);

  return [...externalOrderIds].map((externalOrderId) => {
    const groupedEvents = [...(eventsByOrderId.get(externalOrderId) ?? [])]
      .sort((left, right) => right.received_at.localeCompare(left.received_at));
    const order = ordersByExternalId.get(externalOrderId) ?? null;
    const confirmation = groupedEvents
      .filter((event) => event.event_type === "order_confirmation" && event.status !== "ignored")
      .map((event) => ({ event, parsed: mailEventPayloadSchema.safeParse(event.parsed_payload) }))
      .find((entry) => entry.parsed.success && entry.parsed.data.type === "order_confirmation");
    const payload = confirmation?.parsed.success && confirmation.parsed.data.type === "order_confirmation"
      ? confirmation.parsed.data
      : null;
    const hasCancellation = groupedEvents.some((event) =>
      event.event_type === "cancellation" && event.status !== "ignored"
    );
    const hasShipment = groupedEvents.some((event) =>
      event.event_type === "shipment" && event.status !== "ignored"
    );

    let state: UnifiedOrderState;
    if (order) {
      state = order.cancelled_at ? "cancelled" : order.fulfillment_status;
    } else if (hasCancellation) {
      state = "cancelled";
    } else if (hasShipment) {
      state = "shipped";
    } else if (payload) {
      state = "pending_import";
    } else {
      state = "failed";
    }

    const items = order
      ? order.order_items.map((item) => ({
          albumTitle: item.album_title,
          artistName: item.artist_name,
          cancelledAt: item.cancelled_at
        }))
      : (payload?.items ?? []).map((item) => ({
          albumTitle: item.albumTitle,
          artistName: item.artistName,
          cancelledAt: null
        }));

    return {
      externalOrderId,
      orderId: order?.id ?? null,
      confirmationEventId: confirmation?.event.id ?? null,
      orderedAt: order?.ordered_at ?? payload?.occurredAt ?? groupedEvents.at(-1)?.received_at ?? "",
      currency: order?.currency ?? payload?.currency ?? null,
      total: order?.effective_total ?? payload?.total ?? null,
      state,
      canImport: !order && confirmation?.event.status === "pending" && !hasCancellation,
      items,
      payload,
      events: groupedEvents
    };
  }).sort((left, right) => right.orderedAt.localeCompare(left.orderedAt));
}

export function filterUnifiedOrderRows(
  rows: UnifiedOrderRow[],
  filter: { query: string; status: string }
) {
  const query = filter.query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const matchesStatus = filter.status === "all"
      || (filter.status === "pending_import" ? row.canImport : row.state === filter.status);
    const matchesQuery = !query
      || row.externalOrderId.toLocaleLowerCase().includes(query)
      || row.items.some((item) =>
        item.albumTitle.toLocaleLowerCase().includes(query)
        || item.artistName.toLocaleLowerCase().includes(query)
      );
    return matchesStatus && matchesQuery;
  });
}
