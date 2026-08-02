import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildOrderMailSearchQuery } from "@/features/mail/imap-gateway";

const expectedSubjects = [
  { subject: "Order Acknowledgment" },
  { subject: "Your order has been dispatched" },
  { subject: "Order cancelled" }
];

const expectedMerchantQueries = [
  { from: "imusic.dk", or: expectedSubjects },
  {
    from: "hmv.co.jp",
    or: [
      { subject: "Thank you for your payment of order." },
      { subject: "Your order items have been dispatched from our warehouse." },
      { subject: "Cancellation of Your Order" }
    ]
  },
  { from: "madebymutant.com", subject: "confirmed" },
  { from: "blackscreenrecords.com", subject: "confirmed" },
  {
    from: "sendcloud.com",
    or: [
      { subject: "ready to be shipped" },
      { subject: "is delivered" }
    ]
  },
  {
    from: "lacedmusic.com",
    or: [
      { subject: "confirmed" },
      { subject: "is on the way" },
      { subject: "is out for delivery" },
      { subject: "has been delivered" }
    ]
  }
];

describe("multi-merchant IMAP search query", () => {
  it("filters initial scans by all supported merchants, date and subjects", () => {
    const since = new Date("2025-08-01T00:00:00.000Z");

    expect(buildOrderMailSearchQuery({ since })).toEqual({
      since,
      or: expectedMerchantQueries
    });
  });

  it("filters incremental scans by UID without dropping any merchant", () => {
    expect(buildOrderMailSearchQuery({ uidFrom: 101 })).toEqual({
      uid: "101:*",
      or: expectedMerchantQueries
    });
  });
});
