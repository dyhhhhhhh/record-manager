import { describe, expect, it } from "vitest";

import {
  filterMailEventGroups,
  groupMailEvents,
  isMailEventStatusActionable
} from "@/features/inbox/event-groups";

const event = (
  id: string,
  type: "order_confirmation" | "shipment" | "cancellation",
  status: "pending" | "applied" | "ignored" | "failed",
  orderId: string | null,
  receivedAt: string
) => ({
  id,
  event_type: type,
  status,
  external_order_id: orderId,
  subject: `${type}-${id}`,
  sender: "order@imusic.dk",
  received_at: receivedAt,
  parse_errors: [],
  related_order_id: null
});

describe("mail event groups", () => {
  it("allows actions only for pending and failed events", () => {
    expect(isMailEventStatusActionable("pending")).toBe(true);
    expect(isMailEventStatusActionable("failed")).toBe(true);
    expect(isMailEventStatusActionable("applied")).toBe(false);
    expect(isMailEventStatusActionable("ignored")).toBe(false);
  });

  it("groups order, shipment and cancellation messages by external order ID", () => {
    const groups = groupMailEvents([
      event("cancel", "cancellation", "pending", "12345678", "2026-07-03T00:00:00Z"),
      event("ship", "shipment", "applied", "12345678", "2026-07-02T00:00:00Z"),
      event("order", "order_confirmation", "applied", "12345678", "2026-07-01T00:00:00Z")
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      externalOrderId: "12345678",
      view: "pending",
      primaryEventId: "cancel",
      latestReceivedAt: "2026-07-03T00:00:00Z"
    });
    expect(groups[0].events.map((item) => item.event_type)).toEqual([
      "cancellation",
      "shipment",
      "order_confirmation"
    ]);
  });

  it("opens a pending order confirmation before newer shipment mail", () => {
    const groups = groupMailEvents([
      event("ship", "shipment", "pending", "12345679", "2026-07-02T00:00:00Z"),
      event("order", "order_confirmation", "pending", "12345679", "2026-07-01T00:00:00Z")
    ]);

    expect(groups[0].primaryEventId).toBe("order");
  });

  it("marks a group processed only when it has no pending or failed events", () => {
    const groups = groupMailEvents([
      event("ship", "shipment", "applied", "20000001", "2026-07-02T00:00:00Z"),
      event("order", "order_confirmation", "applied", "20000001", "2026-07-01T00:00:00Z")
    ]);

    expect(groups[0].view).toBe("processed");
    expect(groups[0].primaryEventId).toBe("ship");
  });

  it("filters grouped orders between pending and processed views", () => {
    const groups = groupMailEvents([
      event("pending", "shipment", "pending", "30000001", "2026-07-03T00:00:00Z"),
      event("processed", "shipment", "applied", "30000002", "2026-07-02T00:00:00Z")
    ]);

    expect(filterMailEventGroups(groups, "pending").map((group) => group.externalOrderId)).toEqual(["30000001"]);
    expect(filterMailEventGroups(groups, "processed").map((group) => group.externalOrderId)).toEqual(["30000002"]);
  });

  it("keeps failed messages without an order ID in separate groups", () => {
    const groups = groupMailEvents([
      event("failed-a", "order_confirmation", "failed", null, "2026-07-02T00:00:00Z"),
      event("failed-b", "order_confirmation", "failed", null, "2026-07-01T00:00:00Z")
    ]);

    expect(groups).toHaveLength(2);
  });
});
