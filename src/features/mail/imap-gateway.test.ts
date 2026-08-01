import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildImusicSearchQuery } from "@/features/mail/imap-gateway";

const expectedSubjects = [
  { subject: "Order Acknowledgment" },
  { subject: "Your order has been dispatched" },
  { subject: "Order cancelled" }
];

describe("iMusic IMAP search query", () => {
  it("filters initial scans by sender, date and supported order subjects", () => {
    const since = new Date("2025-08-01T00:00:00.000Z");

    expect(buildImusicSearchQuery({ since })).toEqual({
      from: "imusic.dk",
      since,
      or: expectedSubjects
    });
  });

  it("filters incremental scans by sender, UID and supported order subjects", () => {
    expect(buildImusicSearchQuery({ uidFrom: 101 })).toEqual({
      from: "imusic.dk",
      uid: "101:*",
      or: expectedSubjects
    });
  });
});
