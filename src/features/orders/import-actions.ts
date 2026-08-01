"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOwner } from "@/features/auth/require-owner";
import { storeRemoteCover } from "@/features/covers/store-cover";
import { parseOrderConfirmationForm } from "@/features/orders/import-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { orderConfirmationPayloadSchema, type OrderConfirmationPayload } from "@/types/domain";

type EditableOrder = Omit<OrderConfirmationPayload, "type">;

function ordersError(error: unknown): never {
  const message = error instanceof Error ? error.message : "导入订单失败";
  redirect(`/orders?error=${encodeURIComponent(message)}`);
}

async function importOrder(eventId: string, order: EditableOrder) {
  const user = await requireOwner();
  const supabase = await createSupabaseServerClient();
  const items = order.items.map((item) => ({ ...item, id: randomUUID() }));
  const { data, error } = await supabase.rpc("confirm_order_event", {
    p_event_id: eventId,
    p_external_order_id: order.externalOrderId,
    p_ordered_at: order.occurredAt,
    p_currency: order.currency,
    p_items_subtotal: order.itemsSubtotal,
    p_shipping_total: order.shippingTotal,
    p_shipping_method: order.shippingMethod,
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
    const imagePath = await storeRemoteCover(supabase, user.id, item.id, item.imageUrl);
    if (imagePath) {
      await supabase.from("order_items").update({ image_path: imagePath }).eq("id", item.id).eq("order_id", data as string);
    }
  }));

  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath(`/orders/${encodeURIComponent(order.externalOrderId)}`);
  return data as string;
}

export async function importOrderFromListAction(eventId: string) {
  try {
    await requireOwner();
    const supabase = await createSupabaseServerClient();
    const { data: event, error } = await supabase
      .from("mail_events")
      .select("parsed_payload")
      .eq("id", eventId)
      .eq("event_type", "order_confirmation")
      .eq("status", "pending")
      .maybeSingle();
    if (error || !event) throw error ?? new Error("待导入订单不存在");
    const payload = orderConfirmationPayloadSchema.parse(event.parsed_payload);
    await importOrder(eventId, payload);
  } catch (error) {
    ordersError(error);
  }
}

export async function importOrderFromDetailAction(eventId: string, currentExternalOrderId: string, formData: FormData) {
  let externalOrderId: string;
  try {
    const order = parseOrderConfirmationForm(formData);
    externalOrderId = order.externalOrderId;
    await importOrder(eventId, {
      externalOrderId: order.externalOrderId,
      occurredAt: order.orderedAt,
      currency: order.currency,
      itemsSubtotal: order.itemsSubtotal,
      shippingTotal: order.shippingTotal,
      shippingMethod: order.shippingMethod,
      taxTotal: order.taxTotal,
      total: order.total,
      items: order.items
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入订单失败";
    redirect(`/orders/${encodeURIComponent(currentExternalOrderId)}?error=${encodeURIComponent(message)}`);
  }
  redirect(`/orders/${encodeURIComponent(externalOrderId)}`);
}
