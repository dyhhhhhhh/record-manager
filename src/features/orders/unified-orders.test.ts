import { describe, expect, it } from "vitest";

import { buildUnifiedOrderRows, filterUnifiedOrderRows } from "@/features/orders/unified-orders";

const confirmationPayload = {
  type: "order_confirmation" as const,
  externalOrderId: "90000001",
  occurredAt: "2026-07-29T03:27:10.000Z",
  currency: "CNY",
  itemsSubtotal: "430.00",
  shippingTotal: "98.00",
  shippingMethod: "FedEx International",
  taxTotal: "0",
  total: "528.00",
  items: [{ albumTitle: "Example Album", artistName: "Example Artist", unitPrice: "430.00", quantity: 1 }]
};

const event = (
  id: string,
  type: "order_confirmation" | "shipment" | "cancellation",
  status: "pending" | "applied" | "ignored" | "failed" = "pending"
) => ({
  id,
  event_type: type,
  status,
  external_order_id: "90000001",
  received_at: type === "order_confirmation" ? "2026-07-29T03:27:10.000Z" : "2026-07-31T03:27:10.000Z",
  parsed_payload: type === "order_confirmation"
    ? confirmationPayload
    : { type, externalOrderId: "90000001", occurredAt: "2026-07-31T03:27:10.000Z", itemHints: [] },
  parse_errors: [],
  related_order_id: null
});

describe("unified order rows", () => {
  it("merges confirmation and shipment mail into one importable shipped row", () => {
    const rows = buildUnifiedOrderRows([event("confirmation", "order_confirmation"), event("shipment", "shipment")], []);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      externalOrderId: "90000001",
      confirmationEventId: "confirmation",
      state: "shipped",
      canImport: true,
      currency: "CNY",
      total: "528.00"
    });
  });

  it("hides import when an unimported order has a cancellation email", () => {
    const rows = buildUnifiedOrderRows([event("confirmation", "order_confirmation"), event("cancel", "cancellation")], []);

    expect(rows[0]).toMatchObject({ state: "cancelled", canImport: false });
  });

  it("uses the stored order state after a cancelled order has been manually restored", () => {
    const rows = buildUnifiedOrderRows(
      [event("confirmation", "order_confirmation", "applied"), event("cancel", "cancellation", "applied")],
      [{
        id: "stored-order",
        external_order_id: "90000001",
        ordered_at: "2026-07-29T03:27:10.000Z",
        currency: "CNY",
        effective_total: "528.00",
        fulfillment_status: "received",
        cancelled_at: null,
        order_items: [{ id: "item", album_title: "Example Album", artist_name: "Example Artist", cancelled_at: null }]
      }]
    );

    expect(rows[0]).toMatchObject({ orderId: "stored-order", state: "received", canImport: false });
  });

  it("searches record data from pending confirmation payloads", () => {
    const rows = buildUnifiedOrderRows([event("confirmation", "order_confirmation")], []);

    expect(filterUnifiedOrderRows(rows, { query: "example artist", status: "all" })).toHaveLength(1);
    expect(filterUnifiedOrderRows(rows, { query: "missing", status: "all" })).toHaveLength(0);
  });
});
