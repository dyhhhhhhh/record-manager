import { describe, expect, it } from "vitest";

import { buildUnifiedOrderRows, filterUnifiedOrderRows } from "@/features/orders/unified-orders";

const confirmationPayload = {
  merchant: "imusic" as const,
  type: "order_confirmation" as const,
  externalOrderId: "90000001",
  occurredAt: "2026-07-29T03:27:10.000Z",
  currency: "CNY",
  itemsSubtotal: "430.00",
  shippingTotal: "98.00",
  shippingMethod: "FedEx International",
  discountTotal: "0",
  taxTotal: "0",
  total: "528.00",
  items: [{ albumTitle: "Example Album", artistName: "Example Artist", unitPrice: "430.00", quantity: 1 }]
};

const event = (
  id: string,
  type: "order_confirmation" | "shipment" | "cancellation",
  status: "pending" | "applied" | "ignored" | "failed" = "pending",
  authenticationVerified = type !== "order_confirmation"
) => ({
  id,
  event_type: type,
  merchant: "imusic" as const,
  status,
  external_order_id: "90000001",
  received_at: type === "order_confirmation" ? "2026-07-29T03:27:10.000Z" : "2026-07-31T03:27:10.000Z",
  parsed_payload: type === "order_confirmation"
    ? confirmationPayload
    : { merchant: "imusic", type, externalOrderId: "90000001", occurredAt: "2026-07-31T03:27:10.000Z", itemHints: [], items: [] },
  parse_errors: [],
  authentication_verified: authenticationVerified,
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

  it("does not let unverified status mail change a pending import", () => {
    const confirmation = event("confirmation", "order_confirmation");
    const shipment = event("shipment", "shipment", "pending", false);
    const cancellation = event("cancel", "cancellation", "pending", false);

    expect(buildUnifiedOrderRows([confirmation, shipment], [])[0]).toMatchObject({
      state: "pending_import",
      canImport: true
    });
    expect(buildUnifiedOrderRows([confirmation, cancellation], [])[0]).toMatchObject({
      state: "pending_import",
      canImport: true
    });
  });

  it("uses the stored order state after a cancelled order has been manually restored", () => {
    const rows = buildUnifiedOrderRows(
      [event("confirmation", "order_confirmation", "applied"), event("cancel", "cancellation", "applied")],
      [{
        id: "stored-order",
        merchant: "imusic",
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

  it("combines merchant, status and text filters and treats invalid merchants as all", () => {
    const imusic = event("imusic-confirmation", "order_confirmation");
    const hmv = {
      ...event("hmv-confirmation", "order_confirmation"),
      merchant: "hmv" as const,
      parsed_payload: {
        ...confirmationPayload,
        merchant: "hmv",
        currency: "JPY",
        items: [{ ...confirmationPayload.items[0], albumTitle: "HMV Exclusive" }]
      }
    };
    const rows = buildUnifiedOrderRows([imusic, hmv], []);

    expect(filterUnifiedOrderRows(rows, { query: "exclusive", merchant: "hmv", status: "pending_import" }))
      .toMatchObject([{ merchant: "hmv" }]);
    expect(filterUnifiedOrderRows(rows, { query: "exclusive", merchant: "imusic", status: "pending_import" }))
      .toEqual([]);
    expect(filterUnifiedOrderRows(rows, { query: "", merchant: "unknown", status: "all" }))
      .toHaveLength(2);
    expect(filterUnifiedOrderRows(rows, { query: "", merchant: "all", status: "unknown" }))
      .toHaveLength(2);
  });

  it("keeps identical external order IDs from all five merchants separate and filterable", () => {
    const merchants = ["imusic", "hmv", "mutant", "black_screen", "laced"] as const;
    const events = merchants.map((merchant) => ({
      ...event(`${merchant}-confirmation`, "order_confirmation"),
      merchant,
      parsed_payload: {
        ...confirmationPayload,
        merchant,
        currency: merchant === "hmv" ? "JPY" : "CNY",
        items: [{
          ...confirmationPayload.items[0],
          albumTitle: `${merchant} exclusive`
        }]
      }
    }));

    const rows = buildUnifiedOrderRows(events, []);
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => `${row.merchant}:${row.externalOrderId}`).sort()).toEqual([
      "black_screen:90000001",
      "hmv:90000001",
      "imusic:90000001",
      "laced:90000001",
      "mutant:90000001"
    ]);
    expect(filterUnifiedOrderRows(rows, {
      query: "laced exclusive",
      merchant: "laced",
      status: "pending_import"
    })).toMatchObject([{ merchant: "laced" }]);
  });

  it("merges HMV shipment metadata into a pending confirmation preview", () => {
    const confirmation = {
      ...event("hmv-confirmation", "order_confirmation"),
      merchant: "hmv" as const,
      parsed_payload: {
        ...confirmationPayload,
        merchant: "hmv",
        currency: "JPY",
        itemsSubtotal: "4620",
        shippingTotal: "0",
        total: "4620",
        items: [{ albumTitle: "Synthetic Waves〜Vinyl〜", artistName: "未知艺人", unitPrice: "4620", quantity: 1 }]
      }
    };
    const shipment = {
      ...event("hmv-shipment", "shipment"),
      merchant: "hmv" as const,
      parsed_payload: {
        merchant: "hmv",
        type: "shipment",
        externalOrderId: "90000001",
        occurredAt: "2026-07-31T03:27:10.000Z",
        itemHints: [],
        items: [{
          albumTitle: "Synthetic Waves～Vinyl～",
          artistName: "Synthetic Artist",
          unitPrice: "4620",
          quantity: 1,
          imageUrl: "https://img.hmv.co.jp/img.asp?sku=1&size=190"
        }]
      }
    };

    const row = buildUnifiedOrderRows([confirmation, shipment], [])[0];
    expect(row.payload?.items[0]).toMatchObject({
      artistName: "Synthetic Artist",
      imageUrl: "https://img.hmv.co.jp/img.asp?sku=1&size=190"
    });
  });

  it("does not enrich a preview from an ignored status event", () => {
    const confirmation = {
      ...event("hmv-confirmation", "order_confirmation"),
      merchant: "hmv" as const,
      parsed_payload: {
        ...confirmationPayload,
        merchant: "hmv",
        currency: "JPY",
        itemsSubtotal: "1000",
        shippingTotal: "0",
        total: "1000",
        items: [{ albumTitle: "Album", artistName: "未知艺人", unitPrice: "1000", quantity: 1 }]
      }
    };
    const ignoredShipment = {
      ...event("hmv-shipment", "shipment", "ignored"),
      merchant: "hmv" as const,
      parsed_payload: {
        merchant: "hmv",
        type: "shipment",
        externalOrderId: "90000001",
        occurredAt: "2026-07-31T03:27:10.000Z",
        itemHints: [],
        items: [{ albumTitle: "Album", artistName: "Ignored Artist", unitPrice: "1000", quantity: 1 }]
      }
    };

    expect(buildUnifiedOrderRows([confirmation, ignoredShipment], [])[0].payload?.items[0].artistName)
      .toBe("未知艺人");
  });

  it("does not enrich a preview from an unverified status event", () => {
    const confirmation = {
      ...event("hmv-confirmation", "order_confirmation"),
      merchant: "hmv" as const,
      parsed_payload: {
        ...confirmationPayload,
        merchant: "hmv",
        currency: "JPY",
        itemsSubtotal: "1000",
        shippingTotal: "0",
        total: "1000",
        items: [{ albumTitle: "Album", artistName: "未知艺人", unitPrice: "1000", quantity: 1 }]
      }
    };
    const unverifiedShipment = {
      ...event("hmv-shipment", "shipment", "pending", false),
      merchant: "hmv" as const,
      parsed_payload: {
        merchant: "hmv",
        type: "shipment",
        externalOrderId: "90000001",
        occurredAt: "2026-07-31T03:27:10.000Z",
        itemHints: [],
        items: [{ albumTitle: "Album", artistName: "Unverified Artist", unitPrice: "1000", quantity: 1 }]
      }
    };

    expect(buildUnifiedOrderRows([confirmation, unverifiedShipment], [])[0].payload?.items[0].artistName)
      .toBe("未知艺人");
  });

  it("shows parsed items for a cancellation-only order", () => {
    const cancellation = {
      ...event("hmv-cancellation", "cancellation"),
      merchant: "hmv" as const,
      parsed_payload: {
        merchant: "hmv",
        type: "cancellation",
        externalOrderId: "90000001",
        occurredAt: "2026-07-31T03:27:10.000Z",
        itemHints: [],
        items: [{ albumTitle: "Cancelled Album", artistName: "Artist", unitPrice: "1000", quantity: 1 }]
      }
    };

    expect(buildUnifiedOrderRows([cancellation], [])[0]).toMatchObject({
      merchant: "hmv",
      state: "cancelled",
      canImport: false,
      items: [{ albumTitle: "Cancelled Album", artistName: "Artist", cancelledAt: null }]
    });
  });
});
