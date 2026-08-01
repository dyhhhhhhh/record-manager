"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireOwner } from "@/features/auth/require-owner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currencySchema, fulfillmentStatusSchema, moneySchema } from "@/types/domain";

const orderEditSchema = z.object({
  externalOrderId: z.string().trim().min(1),
  orderedAt: z.string().trim().min(1),
  currency: z.string().trim().transform((value) => value.toLocaleUpperCase()).pipe(currencySchema),
  originalTotal: moneySchema,
  effectiveTotal: moneySchema
});

const itemEditSchema = z.object({
  albumTitle: z.string().trim().min(1),
  artistName: z.string().trim().min(1),
  unitPrice: moneySchema,
  quantity: z.coerce.number().int().positive()
});

function orderError(orderId: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "订单操作失败";
  redirect(`/orders/${orderId}?error=${encodeURIComponent(message)}`);
}

function shanghaiDateTime(value: string) {
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("订单时间无效");
  return date.toISOString();
}

function refreshOrder(orderId: string) {
  revalidatePath("/");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function updateOrderAction(orderId: string, formData: FormData) {
  await requireOwner();
  try {
    const values = orderEditSchema.parse({
      externalOrderId: formData.get("externalOrderId"),
      orderedAt: formData.get("orderedAt"),
      currency: formData.get("currency"),
      originalTotal: formData.get("originalTotal"),
      effectiveTotal: formData.get("effectiveTotal")
    });
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("orders").update({
      external_order_id: values.externalOrderId,
      ordered_at: shanghaiDateTime(values.orderedAt),
      currency: values.currency,
      original_total: values.originalTotal,
      effective_total: values.effectiveTotal
    }).eq("id", orderId);
    if (error) throw error;
  } catch (error) {
    orderError(orderId, error);
  }
  refreshOrder(orderId);
  redirect(`/orders/${orderId}`);
}

export async function setFulfillmentAction(orderId: string, formData: FormData) {
  await requireOwner();
  try {
    const status = fulfillmentStatusSchema.parse(formData.get("status"));
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("orders").update({ fulfillment_status: status }).eq("id", orderId).is("cancelled_at", null);
    if (error) throw error;
  } catch (error) {
    orderError(orderId, error);
  }
  refreshOrder(orderId);
}

export async function setOrderCancellationAction(orderId: string, cancelled: boolean) {
  await requireOwner();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("orders").update({ cancelled_at: cancelled ? new Date().toISOString() : null }).eq("id", orderId);
  if (error) orderError(orderId, error);
  refreshOrder(orderId);
}

export async function setItemCancellationAction(orderId: string, itemId: string, cancelled: boolean, formData: FormData) {
  await requireOwner();
  try {
    const effectiveTotal = moneySchema.parse(formData.get("effectiveTotal"));
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("set_order_item_cancellation", {
      p_order_id: orderId,
      p_item_id: itemId,
      p_cancelled: cancelled,
      p_effective_total: effectiveTotal
    });
    if (error) throw error;
  } catch (error) {
    orderError(orderId, error);
  }
  refreshOrder(orderId);
}

export async function updateOrderItemAction(orderId: string, itemId: string, formData: FormData) {
  await requireOwner();
  try {
    const values = itemEditSchema.parse({
      albumTitle: formData.get("albumTitle"),
      artistName: formData.get("artistName"),
      unitPrice: formData.get("unitPrice"),
      quantity: formData.get("quantity")
    });
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("order_items").update({
      album_title: values.albumTitle,
      artist_name: values.artistName,
      unit_price: values.unitPrice,
      quantity: values.quantity
    }).eq("id", itemId).eq("order_id", orderId);
    if (error) throw error;
  } catch (error) {
    orderError(orderId, error);
  }
  refreshOrder(orderId);
}

export async function uploadItemCoverAction(orderId: string, itemId: string, formData: FormData) {
  const user = await requireOwner();
  try {
    const file = formData.get("cover");
    if (!(file instanceof File) || file.size === 0) throw new Error("请选择封面文件");
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const extension = extensions[file.type];
    if (!extension) throw new Error("只支持 JPEG、PNG、WebP 封面");
    if (file.size > 5 * 1024 * 1024) throw new Error("封面不能超过 5 MB");

    const supabase = await createSupabaseServerClient();
    const path = `${user.id}/${itemId}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("album-covers").upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: true
    });
    if (uploadError) throw uploadError;
    const { error: updateError } = await supabase.from("order_items").update({ image_path: path }).eq("id", itemId).eq("order_id", orderId);
    if (updateError) throw updateError;
  } catch (error) {
    orderError(orderId, error);
  }
  refreshOrder(orderId);
}
