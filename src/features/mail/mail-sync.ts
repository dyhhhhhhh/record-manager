import { classifyImusicHeaders } from "@/features/mail/imusic-parser";
import type { MailEventPayload, MailEventStatus } from "@/types/domain";

export interface MailHeader {
  uid: number;
  messageId: string | null;
  from: string;
  subject: string;
  receivedAt: Date;
}

export interface SyncState {
  mailbox: string;
  initialScanFrom: Date;
  uidValidity: bigint;
  lastSeenUid: number;
}

export interface MailboxGateway {
  connect(): Promise<void>;
  openInbox(): Promise<bigint>;
  search(criteria: { since?: Date; uidFrom?: number }): Promise<number[]>;
  fetchHeaders(uids: number[]): Promise<MailHeader[]>;
  fetchSource(uid: number): Promise<Buffer>;
  close(): Promise<void>;
}

export interface MailSyncRepository {
  tryStart(userId: string): Promise<string | null>;
  getState(userId: string, mailbox: string): Promise<SyncState | null>;
  saveEvent(event: {
    userId?: string;
    mailbox?: string;
    uidValidity?: bigint;
    header: MailHeader;
    payload: MailEventPayload | null;
    status: MailEventStatus;
    errors?: string[];
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
  gateway: MailboxGateway;
  repository: MailSyncRepository;
  parse(source: Buffer): Promise<MailEventPayload | null>;
};

export type SyncResult =
  | { status: "already_running"; scannedCount: 0; matchedCount: 0; failedCount: 0 }
  | { status: "succeeded"; scannedCount: number; matchedCount: number; failedCount: number };

function oneYearBefore(date: Date) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() - 1);
  return result;
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
    const previousState = await input.repository.getState(input.userId, input.mailbox);
    const initialScanFrom = oneYearBefore(input.now);
    const incremental = previousState?.uidValidity === uidValidity;
    const criteria = incremental ? { uidFrom: previousState.lastSeenUid + 1 } : { since: initialScanFrom };
    const uids = await input.gateway.search(criteria);
    const headers = uids.length ? await input.gateway.fetchHeaders(uids) : [];
    scannedCount = headers.length;

    for (const header of headers) {
      const eventType = classifyImusicHeaders({ from: header.from, subject: header.subject });
      if (!eventType) continue;
      matchedCount += 1;

      try {
        const payload = await input.parse(await input.gateway.fetchSource(header.uid));
        if (!payload || payload.type !== eventType) {
          throw new Error("邮件正文与标题类型不一致");
        }
        await input.repository.saveEvent({
          userId: input.userId,
          mailbox: input.mailbox,
          uidValidity,
          header,
          payload,
          status: "pending"
        });
      } catch (error) {
        failedCount += 1;
        await input.repository.saveEvent({
          userId: input.userId,
          mailbox: input.mailbox,
          uidValidity,
          header,
          payload: null,
          status: "failed",
          errors: [error instanceof Error ? error.message : "未知解析错误"]
        });
      }
    }

    const lastSeenUid = uids.length ? Math.max(...uids) : (incremental ? previousState.lastSeenUid : 0);
    await input.repository.saveState({
      userId: input.userId,
      mailbox: input.mailbox,
      initialScanFrom: incremental ? previousState.initialScanFrom : initialScanFrom,
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
