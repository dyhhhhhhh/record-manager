import "server-only";

import { ImapFlow, type MailboxLockObject, type SearchObject } from "imapflow";

import type { MailHeader, MailboxGateway } from "@/features/mail/mail-sync";

export class QqImapGateway implements MailboxGateway {
  private readonly client: ImapFlow;
  private lock: MailboxLockObject | null = null;

  constructor(email: string, authorizationCode: string) {
    this.client = new ImapFlow({
      host: "imap.qq.com",
      port: 993,
      secure: true,
      auth: { user: email, pass: authorizationCode },
      disableAutoIdle: true,
      logger: false,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000
    });
  }

  async connect() {
    await this.client.connect();
  }

  async openInbox() {
    this.lock = await this.client.getMailboxLock("INBOX", { readOnly: true, acquireTimeout: 10_000 });
    if (!this.client.mailbox) throw new Error("QQ 邮箱 INBOX 无法打开");
    return this.client.mailbox.uidValidity;
  }

  async search(criteria: { since?: Date; uidFrom?: number }) {
    const query: SearchObject = { from: "imusic.dk" };
    if (criteria.since) query.since = criteria.since;
    if (criteria.uidFrom) query.uid = `${criteria.uidFrom}:*`;
    return (await this.client.search(query, { uid: true })) || [];
  }

  async fetchHeaders(uids: number[]): Promise<MailHeader[]> {
    const messages = await this.client.fetchAll(
      uids,
      { uid: true, envelope: true, internalDate: true },
      { uid: true }
    );

    return messages.map((message) => {
      const receivedAt = message.envelope?.date ?? message.internalDate;
      return {
        uid: message.uid,
        messageId: message.envelope?.messageId ?? null,
        from: message.envelope?.from?.[0]?.address ?? "",
        subject: message.envelope?.subject ?? "",
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(0)
      };
    });
  }

  async fetchSource(uid: number) {
    const message = await this.client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!message || !message.source) throw new Error(`无法读取 UID ${uid} 的邮件正文`);
    return message.source;
  }

  async close() {
    this.lock?.release();
    this.lock = null;
    if (this.client.usable) {
      try {
        await this.client.logout();
      } catch {
        this.client.close();
      }
    }
  }
}
