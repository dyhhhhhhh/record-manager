import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyImusicHeaders } from "@/features/mail/imusic-parser";
import type { MailSyncRepository, SyncState } from "@/features/mail/mail-sync";

export class SupabaseMailSyncRepository implements MailSyncRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async tryStart(userId: string) {
    const { data, error } = await this.supabase.rpc("try_start_mail_sync", { p_user_id: userId });
    if (error) throw error;
    return (data as string | null) ?? null;
  }

  async getState(userId: string, mailbox: string): Promise<SyncState | null> {
    const { data, error } = await this.supabase
      .from("mail_sync_state")
      .select("mailbox,initial_scan_from,uid_validity,last_seen_uid")
      .eq("user_id", userId)
      .eq("mailbox", mailbox)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.uid_validity == null) return null;

    return {
      mailbox: data.mailbox,
      initialScanFrom: new Date(`${data.initial_scan_from}T00:00:00.000Z`),
      uidValidity: BigInt(String(data.uid_validity)),
      lastSeenUid: Number(data.last_seen_uid)
    };
  }

  async saveEvent(event: Parameters<MailSyncRepository["saveEvent"]>[0]) {
    if (!event.userId || !event.mailbox || event.uidValidity == null) {
      throw new Error("保存邮件事件缺少同步上下文");
    }

    const eventType = event.payload?.type ?? classifyImusicHeaders({
      from: event.header.from,
      subject: event.header.subject
    });
    if (!eventType) return;

    const externalOrderId = event.payload?.externalOrderId ?? event.header.subject.match(/\d+/)?.[0] ?? null;
    let relatedOrderId: string | null = null;

    if (externalOrderId) {
      const { data, error } = await this.supabase
        .from("orders")
        .select("id")
        .eq("user_id", event.userId)
        .eq("merchant", "imusic")
        .eq("external_order_id", externalOrderId)
        .maybeSingle();
      if (error) throw error;
      relatedOrderId = data?.id ?? null;
    }

    const { error } = await this.supabase.from("mail_events").upsert(
      {
        user_id: event.userId,
        mailbox: event.mailbox,
        message_id: event.header.messageId,
        imap_uid: event.header.uid,
        uid_validity: event.uidValidity.toString(),
        sender: event.header.from,
        subject: event.header.subject,
        received_at: event.header.receivedAt.toISOString(),
        event_type: eventType,
        status: event.status,
        external_order_id: externalOrderId,
        parsed_payload: event.payload ?? {},
        parse_errors: event.errors ?? [],
        related_order_id: relatedOrderId
      },
      { onConflict: "user_id,mailbox,uid_validity,imap_uid", ignoreDuplicates: true }
    );
    if (error) throw error;
  }

  async saveState(state: SyncState & { userId?: string }) {
    if (!state.userId) throw new Error("保存同步游标缺少用户 ID");
    const { error } = await this.supabase.from("mail_sync_state").upsert({
      user_id: state.userId,
      mailbox: state.mailbox,
      initial_scan_from: state.initialScanFrom.toISOString().slice(0, 10),
      uid_validity: state.uidValidity.toString(),
      last_seen_uid: state.lastSeenUid,
      last_synced_at: new Date().toISOString(),
      last_error: null
    });
    if (error) throw error;
  }

  async finish(runId: string, result: Parameters<MailSyncRepository["finish"]>[1]) {
    const { error } = await this.supabase.rpc("finish_mail_sync", {
      p_run_id: runId,
      p_status: result.status,
      p_scanned_count: result.scannedCount,
      p_matched_count: result.matchedCount,
      p_failed_count: result.failedCount,
      p_error_summary: result.errorSummary ?? null
    });
    if (error) throw error;
  }
}
