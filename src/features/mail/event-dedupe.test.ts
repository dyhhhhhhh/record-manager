import { describe, expect, it } from "vitest";

import {
  decideIncomingEvent,
  externalOrderIdFromSubject,
  resolveReprocessedEventStatus
} from "@/features/mail/event-dedupe";

describe("incoming mail event deduplication", () => {
  it("skips duplicate message IDs and duplicate pending order acknowledgments", () => {
    expect(decideIncomingEvent({ duplicateMessage: true, duplicateOrderEvent: false, type: "shipment", relatedOrderId: null, status: "pending", automaticStatusTrusted: true })).toBe("skip");
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: true, type: "order_confirmation", relatedOrderId: null, status: "pending", automaticStatusTrusted: false })).toBe("skip");
  });

  it("archives a repeated order acknowledgment when the order already exists", () => {
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "order_confirmation", relatedOrderId: "order-id", status: "pending", automaticStatusTrusted: false })).toBe("archive");
  });

  it("automatically applies only authenticated pending status mail", () => {
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "shipment", relatedOrderId: "order-id", status: "pending", automaticStatusTrusted: true })).toBe("auto_apply");
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "cancellation", relatedOrderId: "order-id", status: "pending", automaticStatusTrusted: true })).toBe("auto_apply");
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "shipment", relatedOrderId: null, status: "pending", automaticStatusTrusted: true })).toBe("auto_apply");
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "shipment", relatedOrderId: "order-id", status: "pending", automaticStatusTrusted: false })).toBe("store");
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "cancellation", relatedOrderId: "order-id", status: "failed", automaticStatusTrusted: true })).toBe("store");
    expect(decideIncomingEvent({ duplicateMessage: false, duplicateOrderEvent: false, type: "order_confirmation", relatedOrderId: "order-id", status: "failed", automaticStatusTrusted: false })).toBe("store");
  });

  it("reopens failed events after a successful reparse but preserves resolved events", () => {
    expect(resolveReprocessedEventStatus("failed", "pending")).toBe("pending");
    expect(resolveReprocessedEventStatus("pending", "failed")).toBe("failed");
    expect(resolveReprocessedEventStatus("applied", "pending")).toBe("applied");
    expect(resolveReprocessedEventStatus("ignored", "pending")).toBe("ignored");
  });

  it("preserves the Laced prefix when a failed event falls back to its subject", () => {
    expect(externalOrderIdFromSubject("laced", "A shipment from order LREU61000002 has been delivered"))
      .toBe("LREU61000002");
    expect(externalOrderIdFromSubject("black_screen", "Your order #71000001 is delivered"))
      .toBe("71000001");
  });
});
