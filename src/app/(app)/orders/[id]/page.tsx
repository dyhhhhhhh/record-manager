import { Disc3, Upload } from "lucide-react";
import Image from "next/image";
import { notFound } from "next/navigation";

import {
  setFulfillmentAction,
  setItemCancellationAction,
  setOrderCancellationAction,
  updateOrderAction,
  updateOrderItemAction,
  uploadItemCoverAction
} from "@/features/orders/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OrderPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function localDateTime(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(new Date(iso)).replace(" ", "T");
}

export default async function OrderDetailPage({ params, searchParams }: OrderPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id,external_order_id,ordered_at,currency,original_total,effective_total,fulfillment_status,cancelled_at,order_items(*)")
    .eq("id", id)
    .single();
  if (!order) notFound();

  const paths = order.order_items.map((item) => item.image_path).filter((path): path is string => Boolean(path));
  const { data: signed } = paths.length ? await supabase.storage.from("album-covers").createSignedUrls(paths, 3600) : { data: [] };
  const images = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl]));

  return (
    <section>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">iMusic order</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">#{order.external_order_id}</h1>
          <p className="mt-2 text-[var(--muted)]">{new Date(order.ordered_at).toLocaleString("zh-CN")} · {order.order_items.length} 个条目</p>
        </div>
        <span className={`w-fit rounded-full px-4 py-2 text-sm font-bold ${order.cancelled_at ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-900"}`}>
          {order.cancelled_at ? "整单已取消" : ({ ordered: "未发货", shipped: "已发货", received: "已收到" } as const)[order.fulfillment_status as "ordered" | "shipped" | "received"]}
        </span>
      </div>

      {query.error ? <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">{String(query.error)}</div> : null}

      <div className="mt-8 grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {order.order_items.map((item) => {
            const image = item.image_path ? images.get(item.image_path) : null;
            return (
              <article className={`rounded-3xl border p-5 ${item.cancelled_at ? "border-red-200 bg-red-50/60" : "border-[var(--line)] bg-[var(--surface)]"}`} key={item.id}>
                <div className="grid gap-5 sm:grid-cols-[140px_1fr]">
                  <div>
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-black/5">
                      {image ? <Image alt={`${item.artist_name}《${item.album_title}》封面`} fill className="object-cover" sizes="140px" src={image} /> : <span className="grid h-full place-items-center"><Disc3 className="text-black/20" size={48} /></span>}
                    </div>
                    <form action={uploadItemCoverAction.bind(null, id, item.id)} className="mt-3">
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold">
                        <Upload size={14} />上传封面<input accept="image/jpeg,image/png,image/webp" className="sr-only" name="cover" type="file" required />
                      </label>
                      <button className="mt-2 w-full rounded-lg bg-black/5 py-2 text-xs font-semibold">保存上传</button>
                    </form>
                  </div>
                  <div>
                    <form action={updateOrderItemAction.bind(null, id, item.id)} className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold sm:col-span-2">专辑<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="albumTitle" defaultValue={item.album_title} required /></label>
                      <label className="text-xs font-semibold sm:col-span-2">艺人<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="artistName" defaultValue={item.artist_name} required /></label>
                      <label className="text-xs font-semibold">单价（{order.currency}）<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="unitPrice" defaultValue={item.unit_price} required /></label>
                      <label className="text-xs font-semibold">数量<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" min={1} name="quantity" type="number" defaultValue={item.quantity} required /></label>
                      <button className="h-10 rounded-lg bg-[var(--green)] px-4 text-sm font-semibold text-white sm:col-span-2">保存唱片信息</button>
                    </form>
                    <form action={setItemCancellationAction.bind(null, id, item.id, !item.cancelled_at)} className="mt-4 flex flex-col gap-2 rounded-xl border border-black/10 p-3 sm:flex-row sm:items-end">
                      <label className="flex-1 text-xs font-semibold">操作后的订单实付<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="effectiveTotal" defaultValue={order.effective_total} required /></label>
                      <button className={`h-10 rounded-lg px-4 text-sm font-semibold ${item.cancelled_at ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}>
                        {item.cancelled_at ? "恢复这张唱片" : "取消这张唱片"}
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <aside className="space-y-5">
          <form action={updateOrderAction.bind(null, id)} className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">订单信息</h2>
            <label className="block text-xs font-semibold">订单 ID<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="externalOrderId" defaultValue={order.external_order_id} required /></label>
            <label className="block text-xs font-semibold">下单时间<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="orderedAt" type="datetime-local" defaultValue={localDateTime(order.ordered_at)} required /></label>
            <label className="block text-xs font-semibold">币种<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm uppercase" maxLength={3} name="currency" defaultValue={order.currency} required /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold">原始实付<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="originalTotal" defaultValue={order.original_total} required /></label>
              <label className="text-xs font-semibold">当前实付<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="effectiveTotal" defaultValue={order.effective_total} required /></label>
            </div>
            <button className="h-10 w-full rounded-lg bg-[var(--green)] text-sm font-semibold text-white">保存订单信息</button>
          </form>

          <form action={setFulfillmentAction.bind(null, id)} className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">履约状态</h2>
            <select className="mt-4 h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3" disabled={Boolean(order.cancelled_at)} name="status" defaultValue={order.fulfillment_status}>
              <option value="ordered">未发货</option><option value="shipped">已发货</option><option value="received">已收到</option>
            </select>
            <button className="mt-3 h-10 w-full rounded-lg border border-[var(--line)] bg-white text-sm font-semibold disabled:opacity-50" disabled={Boolean(order.cancelled_at)}>更新状态</button>
          </form>

          <form action={setOrderCancellationAction.bind(null, id, !order.cancelled_at)} className="rounded-3xl border border-red-200 bg-red-50 p-5">
            <h2 className="font-semibold text-red-900">{order.cancelled_at ? "恢复整张订单" : "取消整张订单"}</h2>
            <p className="mt-2 text-sm leading-6 text-red-800">{order.cancelled_at ? "恢复后，有效唱片会重新出现在首页并计入统计。" : "订单内所有唱片会从首页隐藏，并从消费统计中排除。"}</p>
            <button className={`mt-4 h-10 w-full rounded-lg text-sm font-semibold text-white ${order.cancelled_at ? "bg-emerald-700" : "bg-red-700"}`}>{order.cancelled_at ? "确认恢复订单" : "确认取消订单"}</button>
          </form>
        </aside>
      </div>
    </section>
  );
}
