import { describe, expect, it } from "vitest";

import { decideIncomingEvent, resolveReprocessedEventStatus } from "@/features/mail/event-dedupe";

describe("incoming mail event deduplication", () => {
  it("skips duplicate message IDs and duplicate pending order acknowledgments", () => {
    expect(decideIncomingEvent({ duplicateMessage: true, duplicateOrderEvent: false, type: "shipment", relatedOrderId: null })).toBe("skip");
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: true, type: "order_confirmation", relatedOrderId: null })).toBe("skip");
  });

  it("archives a repeated order acknowledgment when the order already exists", () => {
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "order_confirmation", relatedOrderId: "order-id" })).toBe("archive");
  });

  it("automatically applies shipment and cancellation mail linked to an imported order", () => {
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "shipment", relatedOrderId: "order-id" })).toBe("auto_apply");
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "cancellation", relatedOrderId: "order-id" })).toBe("auto_apply");
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "shipment", relatedOrderId: null })).toBe("auto_apply");
  });

  it("reopens failed events after a successful reparse but preserves resolved events", () => {
    expect(resolveReprocessedEventStatus("failed", "pending")).toBe("pending");
    expect(resolveReprocessedEventStatus("pending", "failed")).toBe("failed");
    expect(resolveReprocessedEventStatus("applied", "pending")).toBe("applied");
    expect(resolveReprocessedEventStatus("ignored", "pending")).toBe("ignored");
  });
});
