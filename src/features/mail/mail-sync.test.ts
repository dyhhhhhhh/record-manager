import { describe, expect, it } from "vitest";

import {
  syncMailbox,
  type MailHeader,
  type MailSyncRepository,
  type MailboxGateway,
  type SyncState
} from "@/features/mail/mail-sync";
import { classifyOrderHeaders, type ClassifiedOrderMail } from "@/features/mail/order-mail-parser";
import type { MailEventPayload, MailEventStatus } from "@/types/domain";

class FakeGateway implements MailboxGateway {
  readonly uidValidity = 42n;
  highestUid = 13;
  readonly headers: MailHeader[] = [
    {
      uid: 11,
      messageId: "<order@test>",
      from: "order@imusic.dk",
      fromName: "iMusic",
      replyTo: "",
      subject: "Order Acknowledgment (90000001)",
      receivedAt: new Date("2026-07-29T03:27:10Z")
    },
    {
      uid: 12,
      messageId: "<news@test>",
      from: "news@imusic.dk",
      fromName: "iMusic",
      replyTo: "",
      subject: "This week in vinyl",
      receivedAt: new Date("2026-07-30T03:27:10Z")
    },
    {
      uid: 13,
      messageId: "<hmv@test>",
      from: "email@hmv.co.jp",
      fromName: "HMV Japan",
      replyTo: "",
      subject: "Thank you for your payment of order.",
      receivedAt: new Date("2026-07-31T03:27:10Z")
    }
  ];
  searchCriteria: { since?: Date; uidFrom?: number } | null = null;
  fetchedSources: number[] = [];
  closed = false;

  async connect() {}
  async openInbox() { return this.uidValidity; }
  async getHighestUid() { return this.highestUid; }
  async search(criteria: { since?: Date; uidFrom?: number }) {
    this.searchCriteria = criteria;
    return this.headers.map((header) => header.uid);
  }
  async fetchHeaders() { return this.headers; }
  async fetchSource(uid: number) {
    this.fetchedSources.push(uid);
    return Buffer.from(`source-${uid}`);
  }
  async close() { this.closed = true; }
}

class FakeRepository implements MailSyncRepository {
  state: SyncState | null = null;
  events: Array<{
    header: MailHeader;
    payload: MailEventPayload | null;
    classification: ClassifiedOrderMail;
    status: MailEventStatus;
    reprocessExisting?: boolean;
  }> = [];
  finished: string | null = null;
  runId: string | null = "run-1";
  knownMessageIds = new Set<string>();

  async tryStart() { return this.runId; }
  async getState() { return this.state; }
  async isKnownEvent(input: { header: MailHeader }) {
    return Boolean(input.header.messageId && this.knownMessageIds.has(input.header.messageId));
  }
  async saveEvent(event: { header: MailHeader; payload: MailEventPayload | null; classification: ClassifiedOrderMail; status: MailEventStatus }) {
    this.events.push(event);
  }
  async saveState(state: SyncState) { this.state = state; }
  async finish(_runId: string, result: { status: string }) { this.finished = result.status; }
}

const parsedOrder: MailEventPayload = {
  merchant: "imusic",
  type: "order_confirmation",
  externalOrderId: "90000001",
  occurredAt: "2026-07-29T03:27:10.000Z",
  currency: "CNY",
  itemsSubtotal: "430.00",
  shippingTotal: "98.00",
  shippingMethod: "FedEx International",
  discountTotal: "0",
  taxTotal: "0",
  total: "528.00",
  items: [{ albumTitle: "Album", artistName: "Artist", unitPrice: "430.00", quantity: 1 }]
};

const parsedHmvOrder: MailEventPayload = {
  ...parsedOrder,
  merchant: "hmv",
  externalOrderId: "91000001",
  currency: "JPY"
};

const parseSource = async (source: Buffer) => source.toString() === "source-13" ? parsedHmvOrder : parsedOrder;

describe("mail synchronization", () => {
  it("passes sender display name and Reply-To into header classification", async () => {
    const gateway = new FakeGateway();
    gateway.highestUid = 14;
    gateway.headers.splice(0, gateway.headers.length, {
      uid: 14,
      messageId: "<black-screen@test>",
      from: "tracking@sendcloud.com",
      fromName: "Black Screen Records",
      replyTo: "orders@blackscreenrecords.com",
      subject: "Your order 70000001 is delivered",
      receivedAt: new Date("2026-08-01T00:00:00Z")
    });
    const repository = new FakeRepository();
    const seenHeaders: Array<{ from: string; fromName: string; replyTo: string; subject: string }> = [];

    await syncMailbox({
      userId: "owner-id",
      mailbox: "owner@qq.com",
      now: new Date("2026-08-01T00:00:00Z"),
      gateway,
      repository,
      classify: (headers) => {
        seenHeaders.push(headers);
        return { merchant: "black_screen", type: "shipment" };
      },
      parse: async () => ({
        merchant: "black_screen",
        type: "shipment",
        externalOrderId: "70000001",
        occurredAt: "2026-08-01T00:00:00.000Z",
        itemHints: [],
        items: []
      })
    });

    expect(seenHeaders).toEqual([{
      from: "tracking@sendcloud.com",
      fromName: "Black Screen Records",
      replyTo: "orders@blackscreenrecords.com",
      subject: "Your order 70000001 is delivered"
    }]);
    expect(gateway.fetchedSources).toEqual([14]);
  });

  it("scans one year initially and fetches bodies only for matching order headers", async () => {
    const gateway = new FakeGateway();
    const repository = new FakeRepository();

    const result = await syncMailbox({
      userId: "owner-id",
      mailbox: "owner@qq.com",
      now: new Date("2026-08-01T00:00:00Z"),
      gateway,
      repository,
      classify: classifyOrderHeaders,
      parse: parseSource
    });

    expect(gateway.searchCriteria).toEqual({ since: new Date("2025-08-01T00:00:00Z") });
    expect(gateway.fetchedSources).toEqual([11, 13]);
    expect(repository.events).toHaveLength(2);
    expect(repository.events.map((event) => event.classification)).toEqual([
      { merchant: "imusic", type: "order_confirmation" },
      { merchant: "hmv", type: "order_confirmation" }
    ]);
    expect(repository.events[0]).not.toHaveProperty("source");
    expect(repository.state).toMatchObject({ uidValidity: 42n, lastSeenUid: 13 });
    expect(repository.finished).toBe("succeeded");
    expect(gateway.closed).toBe(true);
    expect(result).toMatchObject({ status: "succeeded", scannedCount: 3, matchedCount: 2 });
  });

  it("uses the next UID for incremental synchronization", async () => {
    const gateway = new FakeGateway();
    const repository = new FakeRepository();
    repository.state = {
      mailbox: "owner@qq.com",
      initialScanFrom: new Date("2025-08-01T00:00:00Z"),
      uidValidity: 42n,
      lastSeenUid: 10
    };

    await syncMailbox({
      userId: "owner-id",
      mailbox: "owner@qq.com",
      now: new Date("2026-08-01T00:00:00Z"),
      gateway,
      repository,
      classify: classifyOrderHeaders,
      parse: parseSource
    });

    expect(gateway.searchCriteria).toEqual({ uidFrom: 11 });
  });

  it.each([
    ["1m", "2026-07-15T12:00:00.000Z"],
    ["3m", "2026-05-15T12:00:00.000Z"],
    ["6m", "2026-02-15T12:00:00.000Z"],
    ["1y", "2025-08-15T12:00:00.000Z"]
  ] as const)("scans the selected %s calendar range", async (range, expectedSince) => {
    const gateway = new FakeGateway();
    const repository = new FakeRepository();
    repository.state = {
      mailbox: "owner@qq.com",
      initialScanFrom: new Date("2025-01-01T00:00:00Z"),
      uidValidity: 42n,
      lastSeenUid: 10
    };

    await syncMailbox({
      userId: "owner-id",
      mailbox: "owner@qq.com",
      now: new Date("2026-08-15T12:00:00Z"),
      range,
      gateway,
      repository,
      classify: classifyOrderHeaders,
      parse: parseSource
    });

    expect(gateway.searchCriteria).toEqual({ since: new Date(expectedSince) });
    expect(repository.state?.initialScanFrom).toEqual(new Date("2025-01-01T00:00:00Z"));
    expect(repository.events[0]).toMatchObject({ reprocessExisting: false });
  });

  it("clamps a calendar-month scan to the final day of a shorter month", async () => {
    const gateway = new FakeGateway();
    const repository = new FakeRepository();

    await syncMailbox({
      userId: "owner-id",
      mailbox: "owner@qq.com",
      now: new Date("2026-03-31T12:00:00Z"),
      range: "1m",
      gateway,
      repository,
      classify: classifyOrderHeaders,
      parse: parseSource
    });

    expect(gateway.searchCriteria).toEqual({ since: new Date("2026-02-28T12:00:00Z") });
  });

  it("does not fetch or reparse known messages during a calendar-range scan", async () => {
    const gateway = new FakeGateway();
    const repository = new FakeRepository();
    repository.knownMessageIds.add("<order@test>");

    await syncMailbox({
      userId: "owner-id",
      mailbox: "owner@qq.com",
      now: new Date("2026-08-01T00:00:00Z"),
      range: "1m",
      gateway,
      repository,
      classify: classifyOrderHeaders,
      parse: parseSource
    });

    expect(gateway.fetchedSources).toEqual([13]);
    expect(repository.events).toHaveLength(1);
    expect(repository.events[0].header.messageId).toBe("<hmv@test>");
  });

  it("rescans the last year and reparses existing events when full mode is requested", async () => {
    const gateway = new FakeGateway();
    const repository = new FakeRepository();
    repository.state = {
      mailbox: "owner@qq.com",
      initialScanFrom: new Date("2025-08-01T00:00:00Z"),
      uidValidity: 42n,
      lastSeenUid: 12
    };

    await syncMailbox({
      userId: "owner-id",
      mailbox: "owner@qq.com",
      now: new Date("2026-08-01T00:00:00Z"),
      mode: "full",
      gateway,
      repository,
      classify: classifyOrderHeaders,
      parse: parseSource
    });

    expect(gateway.searchCriteria).toEqual({ since: new Date("2025-08-01T00:00:00Z") });
    expect(repository.events[0]).toMatchObject({ reprocessExisting: true });
  });

  it("advances the cursor across marketing mail even when no order mail matches", async () => {
    const gateway = new FakeGateway();
    gateway.highestUid = 50;
    gateway.search = async (criteria) => {
      gateway.searchCriteria = criteria;
      return [];
    };
    const repository = new FakeRepository();
    repository.state = {
      mailbox: "owner@qq.com",
      initialScanFrom: new Date("2025-08-01T00:00:00Z"),
      uidValidity: 42n,
      lastSeenUid: 10
    };

    await syncMailbox({
      userId: "owner-id",
      mailbox: "owner@qq.com",
      now: new Date("2026-08-01T00:00:00Z"),
      gateway,
      repository,
      classify: classifyOrderHeaders,
      parse: parseSource
    });

    expect(repository.state?.lastSeenUid).toBe(50);
  });

  it("does not connect when another synchronization holds the database lock", async () => {
    const gateway = new FakeGateway();
    const repository = new FakeRepository();
    repository.runId = null;

    await expect(
      syncMailbox({
        userId: "owner-id",
        mailbox: "owner@qq.com",
        now: new Date(),
        gateway,
        repository,
        classify: classifyOrderHeaders,
        parse: parseSource
      })
    ).resolves.toMatchObject({ status: "already_running" });

    expect(gateway.searchCriteria).toBeNull();
  });

  it("marks a run failed and leaves the cursor untouched when the mailbox connection fails", async () => {
    const gateway = new FakeGateway();
    gateway.connect = async () => { throw new Error("authentication failed"); };
    const repository = new FakeRepository();

    await expect(
      syncMailbox({
        userId: "owner-id",
        mailbox: "owner@qq.com",
        now: new Date(),
        gateway,
        repository,
        classify: classifyOrderHeaders,
        parse: parseSource
      })
    ).rejects.toThrow("authentication failed");

    expect(repository.state).toBeNull();
    expect(repository.finished).toBe("failed");
    expect(gateway.closed).toBe(true);
  });
});
