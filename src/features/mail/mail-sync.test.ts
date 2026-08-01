import { describe, expect, it } from "vitest";

import {
  syncMailbox,
  type MailHeader,
  type MailSyncRepository,
  type MailboxGateway,
  type SyncState
} from "@/features/mail/mail-sync";
import type { MailEventPayload, MailEventStatus } from "@/types/domain";

class FakeGateway implements MailboxGateway {
  readonly uidValidity = 42n;
  highestUid = 12;
  readonly headers: MailHeader[] = [
    {
      uid: 11,
      messageId: "<order@test>",
      from: "order@imusic.dk",
      subject: "Order Acknowledgment (90000001)",
      receivedAt: new Date("2026-07-29T03:27:10Z")
    },
    {
      uid: 12,
      messageId: "<news@test>",
      from: "news@imusic.dk",
      subject: "This week in vinyl",
      receivedAt: new Date("2026-07-30T03:27:10Z")
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
    status: MailEventStatus;
    reprocessExisting?: boolean;
  }> = [];
  finished: string | null = null;
  runId: string | null = "run-1";

  async tryStart() { return this.runId; }
  async getState() { return this.state; }
  async saveEvent(event: { header: MailHeader; payload: MailEventPayload | null; status: MailEventStatus }) {
    this.events.push(event);
  }
  async saveState(state: SyncState) { this.state = state; }
  async finish(_runId: string, result: { status: string }) { this.finished = result.status; }
}

const parsedOrder: MailEventPayload = {
  type: "order_confirmation",
  externalOrderId: "90000001",
  occurredAt: "2026-07-29T03:27:10.000Z",
  currency: "CNY",
  itemsSubtotal: "430.00",
  shippingTotal: "98.00",
  shippingMethod: "FedEx International",
  taxTotal: "0",
  total: "528.00",
  items: [{ albumTitle: "Album", artistName: "Artist", unitPrice: "430.00", quantity: 1 }]
};

describe("mail synchronization", () => {
  it("scans one year initially and fetches bodies only for matching iMusic order headers", async () => {
    const gateway = new FakeGateway();
    const repository = new FakeRepository();

    const result = await syncMailbox({
      userId: "owner-id",
      mailbox: "owner@qq.com",
      now: new Date("2026-08-01T00:00:00Z"),
      gateway,
      repository,
      parse: async () => parsedOrder
    });

    expect(gateway.searchCriteria).toEqual({ since: new Date("2025-08-01T00:00:00Z") });
    expect(gateway.fetchedSources).toEqual([11]);
    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]).not.toHaveProperty("source");
    expect(repository.state).toMatchObject({ uidValidity: 42n, lastSeenUid: 12 });
    expect(repository.finished).toBe("succeeded");
    expect(gateway.closed).toBe(true);
    expect(result).toMatchObject({ status: "succeeded", scannedCount: 2, matchedCount: 1 });
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
      parse: async () => parsedOrder
    });

    expect(gateway.searchCriteria).toEqual({ uidFrom: 11 });
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
      parse: async () => parsedOrder
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
      parse: async () => parsedOrder
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
        parse: async () => parsedOrder
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
        parse: async () => parsedOrder
      })
    ).rejects.toThrow("authentication failed");

    expect(repository.state).toBeNull();
    expect(repository.finished).toBe("failed");
    expect(gateway.closed).toBe(true);
  });
});
