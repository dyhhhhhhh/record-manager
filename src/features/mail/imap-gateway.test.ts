import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildOrderMailSearchQueries } from "@/features/mail/imap-gateway";

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
  },
  {
    from: "cdjapan.co.jp",
    or: [
      { subject: "Order Confirmation #" },
      { subject: "Order Update: We Shipped Your Order Today" }
    ]
  }
];

describe("multi-merchant IMAP search query", () => {
  it("uses one QQ-compatible server query per merchant rule for initial scans", () => {
    const since = new Date("2025-08-01T00:00:00.000Z");

    expect(buildOrderMailSearchQueries({ since })).toEqual(
      expectedMerchantQueries.map((query) => ({ ...query, since }))
    );
  });

  it("adds the same UID boundary to every merchant query", () => {
    expect(buildOrderMailSearchQueries({ uidFrom: 101 })).toEqual(
      expectedMerchantQueries.map((query) => ({ ...query, uid: "101:*" }))
    );
  });
});
