"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/features/auth/require-owner";
import { storeRemoteCover } from "@/features/covers/store-cover";
import { QqImapGateway } from "@/features/mail/imap-gateway";
import { parseImusicMessage } from "@/features/mail/imusic-parser";
import { parseOrderConfirmationForm } from "@/features/inbox/event-form";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { moneySchema } from "@/types/domain";

function errorRedirect(eventId: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "操作失败";
  redirect(`/inbox/${eventId}?error=${encodeURIComponent(message)}`);
}

export async function confirmOrderAction(eventId: string, formData: FormData) {
  const user = await requireOwner();
  const supabase = await createSupabaseServerClient();
  let orderId: string;
  let items: Array<ReturnType<typeof parseOrderConfirmationForm>["items"][number] & { id: string }>;

  try {
    const order = parseOrderConfirmationForm(formData);
    items = order.items.map((item) => ({ ...item, id: randomUUID() }));
    const { data, error } = await supabase.rpc("confirm_order_event", {
      p_event_id: eventId,
      p_external_order_id: order.externalOrderId,
      p_ordered_at: order.orderedAt,
      p_currency: order.currency,
      p_total: order.total,
      p_items: items
    });
    if (error || !data) throw error ?? new Error("订单创建失败");
    orderId = data as string;

    await Promise.all(
      items.map(async (item) => {
        const imagePath = await storeRemoteCover(supabase, user.id, item.id, item.imageUrl);
        if (imagePath) await supabase.from("order_items").update({ image_path: imagePath }).eq("id", item.id);
      })
    );
  } catch (error) {
    errorRedirect(eventId, error);
  }

  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export async function ignoreEventAction(eventId: string) {
  await requireOwner();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("mail_events")
    .update({ status: "ignored", applied_at: new Date().toISOString() })
    .eq("id", eventId)
    .in("status", ["pending", "failed"]);
  if (error) errorRedirect(eventId, error);
  revalidatePath("/inbox");
  redirect("/inbox");
}

export async function applyShipmentAction(eventId: string, formData: FormData) {
  await requireOwner();
  const orderId = String(formData.get("orderId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("apply_shipment_event", { p_event_id: eventId, p_order_id: orderId });
  if (error) errorRedirect(eventId, error);
  revalidatePath("/inbox");
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export async function applyCancellationAction(eventId: string, formData: FormData) {
  await requireOwner();
  const orderId = String(formData.get("orderId") ?? "");
  const scope = String(formData.get("scope") ?? "order");
  const itemId = scope === "item" ? String(formData.get("itemId") ?? "") : null;
  let effectiveTotal: string | null = null;

  try {
    if (scope === "item") effectiveTotal = moneySchema.parse(formData.get("effectiveTotal"));
  } catch (error) {
    errorRedirect(eventId, error);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("apply_cancellation_event", {
    p_event_id: eventId,
    p_order_id: orderId,
    p_item_id: itemId,
    p_effective_total: effectiveTotal
  });
  if (error) errorRedirect(eventId, error);
  revalidatePath("/");
  revalidatePath("/inbox");
  revalidatePath("/orders");
  redirect(`/orders/${orderId}`);
}

export async function retryFailedEventAction(eventId: string) {
  await requireOwner();
  const supabase = await createSupabaseServerClient();
  const { data: event, error } = await supabase
    .from("mail_events")
    .select("id,imap_uid,uid_validity,status")
    .eq("id", eventId)
    .single();
  if (error || !event || event.status !== "failed") errorRedirect(eventId, error ?? new Error("失败事件不存在"));

  const env = getServerEnv();
  const gateway = new QqImapGateway(env.QQ_IMAP_EMAIL, env.QQ_IMAP_AUTH_CODE);
  try {
    await gateway.connect();
    const currentUidValidity = await gateway.openInbox();
    if (currentUidValidity !== BigInt(String(event.uid_validity))) throw new Error("邮箱 UIDVALIDITY 已变化，无法重试旧邮件");
    const payload = await parseImusicMessage(await gateway.fetchSource(Number(event.imap_uid)));
    if (!payload) throw new Error("邮件不再符合 iMusic 规则");
    const { data: order } = await supabase
      .from("orders")
      .select("id")
      .eq("merchant", "imusic")
      .eq("external_order_id", payload.externalOrderId)
      .maybeSingle();
    const { error: updateError } = await supabase
      .from("mail_events")
      .update({
        event_type: payload.type,
        status: "pending",
        external_order_id: payload.externalOrderId,
        parsed_payload: payload,
        parse_errors: [],
        related_order_id: order?.id ?? null
      })
      .eq("id", eventId);
    if (updateError) throw updateError;
  } catch (retryError) {
    errorRedirect(eventId, retryError);
  } finally {
    await gateway.close();
  }

  revalidatePath("/inbox");
  redirect(`/inbox/${eventId}`);
}
