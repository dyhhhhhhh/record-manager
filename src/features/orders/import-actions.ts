"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/features/auth/require-owner";
import { storeRemoteCover } from "@/features/covers/store-cover";
import { canonicalizeCdJapanProductUrl } from "@/features/covers/trusted-cover-url";
import { parseOrderConfirmationForm } from "@/features/orders/import-form";
import { mergeOrderConfirmationMetadata } from "@/features/orders/item-enrichment";
import { statusEventCanAffectOrder } from "@/features/orders/unified-orders";
import { orderDetailHref } from "@/lib/merchant";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mailEventPayloadSchema, orderConfirmationPayloadSchema, type Merchant, type OrderConfirmationPayload } from "@/types/domain";

type EditableOrder = Omit<OrderConfirmationPayload, "type" | "merchant">;

function ordersError(error: unknown): never {
  const message = error instanceof Error ? error.message : "导入订单失败";
  redirect(`/orders?error=${encodeURIComponent(message)}`);
}

async function importOrder(eventId: string, merchant: Merchant, order: EditableOrder) {
  const user = await requireOwner();
  const supabase = await createSupabaseServerClient();
  const items = order.items.map((item) => ({
    ...item,
    ...(merchant === "cdjapan" ? {
      imageUrl: undefined,
      productUrl: item.productUrl ? canonicalizeCdJapanProductUrl(item.productUrl) ?? undefined : undefined
    } : {}),
    id: randomUUID()
  }));
  const { data, error } = await supabase.rpc("confirm_order_event", {
    p_event_id: eventId,
    p_external_order_id: order.externalOrderId,
    p_ordered_at: order.occurredAt,
    p_currency: order.currency,
    p_items_subtotal: order.itemsSubtotal,
    p_shipping_total: order.shippingTotal,
    p_additional_fee_total: order.additionalFeeTotal,
    p_shipping_method: order.shippingMethod,
    p_discount_total: order.discountTotal,
    p_tax_total: order.taxTotal,
    p_total: order.total,
    p_items: items
  });
  if (error || !data) throw error ?? new Error("订单创建失败");

  const { data: storedItems, error: storedItemsError } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", data as string)
    .in("id", items.map((item) => item.id));
  const storedItemIds = new Set((storedItemsError ? [] : storedItems ?? []).map((item) => item.id));

  await Promise.all(items.filter((item) => storedItemIds.has(item.id)).map(async (item) => {
    const imagePath = await storeRemoteCover(supabase, user.id, item.id, item.imageUrl, merchant);
    if (imagePath) {
      await supabase.from("order_items").update({ image_path: imagePath }).eq("id", item.id).eq("order_id", data as string);
    }
  }));

  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath(orderDetailHref(merchant, order.externalOrderId));
  return data as string;
}

export async function importOrderFromListAction(eventId: string) {
  try {
    await requireOwner();
    const supabase = await createSupabaseServerClient();
    const { data: event, error } = await supabase
      .from("mail_events")
      .select("merchant,external_order_id,parsed_payload,manually_cancelled_at")
      .eq("id", eventId)
      .eq("event_type", "order_confirmation")
      .eq("status", "pending")
      .maybeSingle();
    if (error || !event) throw error ?? new Error("待导入订单不存在");
    if (event.manually_cancelled_at) throw new Error("该订单已手动取消，请先恢复订单");
    const confirmation = orderConfirmationPayloadSchema.parse(event.parsed_payload);
    if (confirmation.merchant !== event.merchant || confirmation.externalOrderId !== event.external_order_id) {
      throw new Error("邮件事件与订单载荷不一致，请选择合适的时间范围后同步邮件");
    }
    const { data: relatedEvents, error: relatedError } = await supabase
      .from("mail_events")
      .select("parsed_payload,event_type,status,authentication_verified")
      .eq("merchant", event.merchant)
      .eq("external_order_id", event.external_order_id)
      .neq("status", "ignored");
    if (relatedError) throw relatedError;
    const payloads = (relatedEvents ?? [])
      .filter((related) => related.event_type === "order_confirmation" || statusEventCanAffectOrder(related))
      .map((related) => mailEventPayloadSchema.safeParse(related.parsed_payload))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data);
    const merged = mergeOrderConfirmationMetadata(confirmation, payloads).payload;
    await importOrder(eventId, merged.merchant, merged);
  } catch (error) {
    ordersError(error);
  }
}

export async function importOrderFromDetailAction(eventId: string, merchant: Merchant, currentExternalOrderId: string, formData: FormData) {
  let externalOrderId: string;
  try {
    const order = parseOrderConfirmationForm(formData);
    externalOrderId = order.externalOrderId;
    await importOrder(eventId, merchant, {
      externalOrderId: order.externalOrderId,
      occurredAt: order.orderedAt,
      currency: order.currency,
      itemsSubtotal: order.itemsSubtotal,
      shippingTotal: order.shippingTotal,
      additionalFeeTotal: order.additionalFeeTotal,
      shippingMethod: order.shippingMethod,
      discountTotal: order.discountTotal,
      taxTotal: order.taxTotal,
      total: order.total,
      items: order.items
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入订单失败";
    redirect(`${orderDetailHref(merchant, currentExternalOrderId)}?error=${encodeURIComponent(message)}`);
  }
  redirect(orderDetailHref(merchant, externalOrderId));
}
