import {
  mailEventPayloadSchema,
  merchantSchema,
  type FulfillmentStatus,
  type MailEventStatus,
  type MailEventType,
  type Merchant,
  type OrderConfirmationPayload
} from "@/types/domain";
import { mergeOrderConfirmationMetadata } from "@/features/orders/item-enrichment";

export type UnifiedOrderState = "pending_import" | FulfillmentStatus | "cancelled" | "failed";

export type UnifiedMailEvent = {
  id: string;
  merchant: Merchant;
  event_type: MailEventType;
  status: MailEventStatus;
  external_order_id: string | null;
  received_at: string;
  parsed_payload: unknown;
  parse_errors: unknown;
  authentication_verified: boolean;
  related_order_id: string | null;
};

export type UnifiedStoredOrder = {
  id: string;
  merchant: Merchant;
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
  merchant: Merchant;
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

const FILTER_STATUSES = new Set(["all", "pending_import", "ordered", "shipped", "received", "cancelled", "failed"]);

export function statusEventCanAffectOrder(event: Pick<UnifiedMailEvent, "status" | "authentication_verified">) {
  return event.status === "applied" || (event.status === "pending" && event.authentication_verified);
}

export function buildUnifiedOrderRows(
  events: UnifiedMailEvent[],
  orders: UnifiedStoredOrder[]
): UnifiedOrderRow[] {
  const keyFor = (merchant: Merchant, externalOrderId: string) => `${merchant}\u0000${externalOrderId}`;
  const eventsByOrderId = new Map<string, UnifiedMailEvent[]>();
  const identities = new Map<string, { merchant: Merchant; externalOrderId: string }>();
  for (const event of events) {
    if (!event.external_order_id) continue;
    const key = keyFor(event.merchant, event.external_order_id);
    const grouped = eventsByOrderId.get(key) ?? [];
    grouped.push(event);
    eventsByOrderId.set(key, grouped);
    identities.set(key, { merchant: event.merchant, externalOrderId: event.external_order_id });
  }

  const ordersByExternalId = new Map(orders.map((order) => {
    const key = keyFor(order.merchant, order.external_order_id);
    identities.set(key, { merchant: order.merchant, externalOrderId: order.external_order_id });
    return [key, order] as const;
  }));

  return [...identities].map(([key, identity]) => {
    const { merchant, externalOrderId } = identity;
    const groupedEvents = [...(eventsByOrderId.get(key) ?? [])]
      .sort((left, right) => right.received_at.localeCompare(left.received_at));
    const order = ordersByExternalId.get(key) ?? null;
    const parsedEvents = groupedEvents.flatMap((event) => {
      if (event.status === "ignored") return [];
      const result = mailEventPayloadSchema.safeParse(event.parsed_payload);
      return result.success && result.data.merchant === merchant
        ? [{ event, parsed: result.data }]
        : [];
    });
    const confirmation = parsedEvents.find(({ event, parsed }) =>
      event.event_type === "order_confirmation"
      && event.status !== "ignored"
      && parsed.type === "order_confirmation"
    );
    const confirmationPayload = confirmation?.parsed.type === "order_confirmation"
      ? confirmation.parsed
      : null;
    const effectiveParsedEvents = parsedEvents.filter(({ event }) =>
      event.event_type === "order_confirmation"
      || statusEventCanAffectOrder(event)
    );
    const payload = confirmationPayload
      ? mergeOrderConfirmationMetadata(confirmationPayload, effectiveParsedEvents.map((entry) => entry.parsed)).payload
      : null;
    const statusItems = effectiveParsedEvents
      .map((entry) => entry.parsed)
      .find((parsed) => parsed.type !== "order_confirmation" && parsed.items.length)?.items ?? [];
    const hasCancellation = groupedEvents.some((event) =>
      event.event_type === "cancellation"
      && statusEventCanAffectOrder(event)
    );
    const hasShipment = groupedEvents.some((event) =>
      event.event_type === "shipment"
      && statusEventCanAffectOrder(event)
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
        })).concat(payload || !statusItems.length ? [] : statusItems.map((item) => ({
          albumTitle: item.albumTitle,
          artistName: item.artistName,
          cancelledAt: null
        })));

    return {
      merchant,
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
  filter: { query: string; merchant?: string; status: string }
) {
  const query = filter.query.trim().toLocaleLowerCase();
  const parsedMerchant = merchantSchema.safeParse(filter.merchant);
  const merchant = parsedMerchant.success ? parsedMerchant.data : "all";
  const status = FILTER_STATUSES.has(filter.status) ? filter.status : "all";
  return rows.filter((row) => {
    const matchesMerchant = merchant === "all" || row.merchant === merchant;
    const matchesStatus = status === "all"
      || (status === "pending_import" ? row.canImport : row.state === status);
    const matchesQuery = !query
      || row.externalOrderId.toLocaleLowerCase().includes(query)
      || row.items.some((item) =>
        item.albumTitle.toLocaleLowerCase().includes(query)
        || item.artistName.toLocaleLowerCase().includes(query)
      );
    return matchesMerchant && matchesStatus && matchesQuery;
  });
}
