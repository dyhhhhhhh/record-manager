import type { ClassifiedOrderMail } from "@/features/mail/order-mail-parser";
import type { OrderMailHeaders } from "@/features/mail/order-mail-adapter";
import type { MailEventPayload, MailEventStatus } from "@/types/domain";

export interface MailHeader {
  uid: number;
  messageId: string | null;
  from: string;
  fromName: string;
  replyTo: string;
  subject: string;
  receivedAt: Date;
}

export interface SyncState {
  mailbox: string;
  initialScanFrom: Date;
  uidValidity: bigint;
  lastSeenUid: number;
}

export type MailSyncRange = "since_last" | "1m" | "3m" | "6m" | "1y";

export interface MailboxGateway {
  connect(): Promise<void>;
  openInbox(): Promise<bigint>;
  getHighestUid(): Promise<number>;
  search(criteria: { since?: Date; uidFrom?: number }): Promise<number[]>;
  fetchHeaders(uids: number[]): Promise<MailHeader[]>;
  fetchSource(uid: number): Promise<Buffer>;
  close(): Promise<void>;
}

export interface MailSyncRepository {
  tryStart(userId: string): Promise<string | null>;
  getState(userId: string, mailbox: string): Promise<SyncState | null>;
  isKnownEvent(input: {
    userId: string;
    mailbox: string;
    uidValidity: bigint;
    header: MailHeader;
  }): Promise<boolean>;
  saveEvent(event: {
    userId?: string;
    mailbox?: string;
    uidValidity?: bigint;
    header: MailHeader;
    classification: ClassifiedOrderMail;
    payload: MailEventPayload | null;
    status: MailEventStatus;
    errors?: string[];
    reprocessExisting?: boolean;
  }): Promise<void>;
  saveState(state: SyncState & { userId?: string }): Promise<void>;
  finish(
    runId: string,
    result: {
      status: "succeeded" | "failed";
      scannedCount: number;
      matchedCount: number;
      failedCount: number;
      errorSummary?: string;
    }
  ): Promise<void>;
}

type SyncMailboxInput = {
  userId: string;
  mailbox: string;
  now: Date;
  mode?: "incremental" | "full";
  range?: MailSyncRange;
  gateway: MailboxGateway;
  repository: MailSyncRepository;
  classify(headers: OrderMailHeaders): ClassifiedOrderMail | null;
  parse(source: Buffer): Promise<MailEventPayload | null>;
};

export type SyncResult =
  | { status: "already_running"; scannedCount: 0; matchedCount: 0; failedCount: 0 }
  | { status: "succeeded"; scannedCount: number; matchedCount: number; failedCount: number };

const RANGE_MONTHS: Record<Exclude<MailSyncRange, "since_last">, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
  "1y": 12
};

function monthsBefore(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function earlierDate(left: Date, right: Date) {
  return left.getTime() <= right.getTime() ? left : right;
}

export async function syncMailbox(input: SyncMailboxInput): Promise<SyncResult> {
  const runId = await input.repository.tryStart(input.userId);
  if (!runId) {
    return { status: "already_running", scannedCount: 0, matchedCount: 0, failedCount: 0 };
  }

  let scannedCount = 0;
  let matchedCount = 0;
  let failedCount = 0;

  try {
    await input.gateway.connect();
    const uidValidity = await input.gateway.openInbox();
    const highestUid = await input.gateway.getHighestUid();
    const previousState = await input.repository.getState(input.userId, input.mailbox);
    const range = input.range ?? "since_last";
    const full = input.mode === "full";
    const incremental = !full && range === "since_last" && previousState?.uidValidity === uidValidity;
    const selectedScanFrom = full || range === "since_last"
      ? monthsBefore(input.now, 12)
      : monthsBefore(input.now, RANGE_MONTHS[range]);
    const criteria = incremental ? { uidFrom: previousState.lastSeenUid + 1 } : { since: selectedScanFrom };
    const uids = await input.gateway.search(criteria);
    const headers = uids.length ? await input.gateway.fetchHeaders(uids) : [];
    scannedCount = headers.length;

    for (const header of headers) {
      const classification = input.classify({
        from: header.from,
        fromName: header.fromName,
        replyTo: header.replyTo,
        subject: header.subject
      });
      if (!classification) continue;
      matchedCount += 1;

      if (!full && range !== "since_last" && await input.repository.isKnownEvent({
        userId: input.userId,
        mailbox: input.mailbox,
        uidValidity,
        header
      })) continue;

      try {
        const payload = await input.parse(await input.gateway.fetchSource(header.uid));
        if (!payload || payload.type !== classification.type || payload.merchant !== classification.merchant) {
          throw new Error("邮件正文与标题的商家或类型不一致");
        }
        await input.repository.saveEvent({
          userId: input.userId,
          mailbox: input.mailbox,
          uidValidity,
          header,
          classification,
          payload,
          status: "pending",
          reprocessExisting: full
        });
      } catch (error) {
        failedCount += 1;
        await input.repository.saveEvent({
          userId: input.userId,
          mailbox: input.mailbox,
          uidValidity,
          header,
          classification,
          payload: null,
          status: "failed",
          errors: [error instanceof Error ? error.message : "未知解析错误"],
          reprocessExisting: full
        });
      }
    }

    const lastSeenUid = uids.length ? Math.max(highestUid, ...uids) : highestUid;
    await input.repository.saveState({
      userId: input.userId,
      mailbox: input.mailbox,
      initialScanFrom: previousState
        ? earlierDate(previousState.initialScanFrom, incremental ? previousState.initialScanFrom : selectedScanFrom)
        : selectedScanFrom,
      uidValidity,
      lastSeenUid
    });

    const result = { status: "succeeded" as const, scannedCount, matchedCount, failedCount };
    await input.repository.finish(runId, result);
    return result;
  } catch (error) {
    await input.repository.finish(runId, {
      status: "failed",
      scannedCount,
      matchedCount,
      failedCount,
      errorSummary: error instanceof Error ? error.message : "未知同步错误"
    });
    throw error;
  } finally {
    await input.gateway.close();
  }
}
