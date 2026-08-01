import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyImusicHeaders } from "@/features/mail/imusic-parser";
import { decideIncomingEvent, resolveReprocessedEventStatus } from "@/features/mail/event-dedupe";
import type { MailSyncRepository, SyncState } from "@/features/mail/mail-sync";

export class SupabaseMailSyncRepository implements MailSyncRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async applyAutomaticStatus(eventId: string, userId: string) {
    const { error } = await this.supabase.rpc("apply_mail_event_status", {
      p_user_id: userId,
      p_event_id: eventId
    });
    if (!error) return;

    await this.supabase
      .from("mail_events")
      .update({
        status: "failed",
        parse_errors: [`自动更新订单状态失败：${error.message}`],
        applied_at: null
      })
      .eq("id", eventId);
    throw error;
  }

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

    let existingEvent: {
      id: string;
      status: "pending" | "applied" | "ignored" | "failed";
      related_order_id: string | null;
    } | null = null;

    if (event.reprocessExisting) {
      const { data: existingByUid, error: uidError } = await this.supabase
        .from("mail_events")
        .select("id,status,related_order_id")
        .eq("user_id", event.userId)
        .eq("mailbox", event.mailbox)
        .eq("uid_validity", event.uidValidity.toString())
        .eq("imap_uid", event.header.uid)
        .maybeSingle();
      if (uidError) throw uidError;
      existingEvent = existingByUid;

      if (!existingEvent && event.header.messageId) {
        const { data: existingByMessage, error: messageError } = await this.supabase
          .from("mail_events")
          .select("id,status,related_order_id")
          .eq("user_id", event.userId)
          .eq("mailbox", event.mailbox)
          .eq("message_id", event.header.messageId)
          .maybeSingle();
        if (messageError) throw messageError;
        existingEvent = existingByMessage;
      }
    }

    let duplicateMessage = false;
    if (!event.reprocessExisting && event.header.messageId) {
      const { data, error } = await this.supabase
        .from("mail_events")
        .select("id")
        .eq("user_id", event.userId)
        .eq("mailbox", event.mailbox)
        .eq("message_id", event.header.messageId)
        .maybeSingle();
      if (error) throw error;
      duplicateMessage = Boolean(data);
    }

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

    if (existingEvent) {
      const nextStatus = resolveReprocessedEventStatus(existingEvent.status, event.status);
      if (nextStatus === "applied" || nextStatus === "ignored") return;

      const { error } = await this.supabase
        .from("mail_events")
        .update({
          message_id: event.header.messageId,
          imap_uid: event.header.uid,
          uid_validity: event.uidValidity.toString(),
          sender: event.header.from,
          subject: event.header.subject,
          received_at: event.header.receivedAt.toISOString(),
          event_type: eventType,
          status: nextStatus,
          external_order_id: externalOrderId,
          parsed_payload: event.payload ?? {},
          parse_errors: event.errors ?? [],
          related_order_id: relatedOrderId ?? existingEvent.related_order_id,
          applied_at: null
        })
        .eq("id", existingEvent.id);
      if (error) throw error;
      if (eventType !== "order_confirmation" && nextStatus === "pending") {
        await this.applyAutomaticStatus(existingEvent.id, event.userId);
      }
      return;
    }

    let duplicateOrderEvent = false;
    if (eventType === "order_confirmation" && externalOrderId && !relatedOrderId) {
      const { data, error } = await this.supabase
        .from("mail_events")
        .select("id")
        .eq("user_id", event.userId)
        .eq("event_type", "order_confirmation")
        .eq("external_order_id", externalOrderId)
        .in("status", ["pending", "applied"])
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      duplicateOrderEvent = Boolean(data);
    }

    const decision = decideIncomingEvent({ duplicateMessage, duplicateOrderEvent, type: eventType, relatedOrderId });
    if (decision === "skip") return;
    const storedStatus = decision === "archive" ? "applied" : event.status;

    const { data: storedEvent, error } = await this.supabase.from("mail_events").upsert(
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
        status: storedStatus,
        external_order_id: externalOrderId,
        parsed_payload: event.payload ?? {},
        parse_errors: event.errors ?? [],
        related_order_id: relatedOrderId,
        applied_at: decision === "archive" ? new Date().toISOString() : null
      },
      { onConflict: "user_id,mailbox,uid_validity,imap_uid", ignoreDuplicates: true }
    ).select("id").maybeSingle();
    if (error) throw error;
    if (decision === "auto_apply" && storedEvent?.id) {
      await this.applyAutomaticStatus(storedEvent.id, event.userId);
    }
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
