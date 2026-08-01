import Image from "next/image";
import { notFound } from "next/navigation";

import { CancellationEventForm } from "@/components/cancellation-event-form";
import {
  applyShipmentAction,
  confirmOrderAction,
  ignoreEventAction,
  retryFailedEventAction
} from "@/features/inbox/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mailEventPayloadSchema, type OrderConfirmationPayload } from "@/types/domain";

type EventPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function localDateTime(iso: string) {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);
  return parts.replace(" ", "T");
}

function OrderConfirmationForm({ eventId, payload }: { eventId: string; payload: OrderConfirmationPayload }) {
  return (
    <form action={confirmOrderAction.bind(null, eventId)} className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-semibold">订单 ID<input className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] px-3" name="externalOrderId" defaultValue={payload.externalOrderId} required /></label>
        <label className="text-sm font-semibold">下单时间<input className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] px-3" name="orderedAt" type="datetime-local" defaultValue={localDateTime(payload.occurredAt)} required /></label>
        <label className="text-sm font-semibold">币种<input className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] px-3 uppercase" name="currency" defaultValue={payload.currency} maxLength={3} required /></label>
        <label className="text-sm font-semibold">实付总额<input className="mt-2 h-11 w-full rounded-xl border border-[var(--line)] px-3" name="total" defaultValue={payload.total} pattern="\d+(\.\d{1,2})?" required /></label>
      </div>
      <input name="itemCount" type="hidden" value={payload.items.length} />
      <div className="space-y-4">
        {payload.items.map((item, index) => (
          <fieldset className="grid gap-4 rounded-2xl border border-[var(--line)] bg-white/60 p-4 sm:grid-cols-[96px_1fr_1fr]" key={`${item.albumTitle}-${index}`}>
            <div className="relative aspect-square overflow-hidden rounded-xl bg-black/5">
              {item.imageUrl ? <Image alt="" fill className="object-cover" src={item.imageUrl} sizes="96px" /> : <span className="grid h-full place-items-center text-xs text-[var(--muted)]">暂无封面</span>}
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold">专辑<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] px-3 text-sm" name={`albumTitle.${index}`} defaultValue={item.albumTitle} required /></label>
              <label className="block text-xs font-semibold">艺人<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] px-3 text-sm" name={`artistName.${index}`} defaultValue={item.artistName} required /></label>
            </div>
            <div className="grid content-start grid-cols-2 gap-3">
              <label className="text-xs font-semibold">单价<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] px-3 text-sm" name={`unitPrice.${index}`} defaultValue={item.unitPrice} required /></label>
              <label className="text-xs font-semibold">数量<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] px-3 text-sm" name={`quantity.${index}`} type="number" min={1} defaultValue={item.quantity} required /></label>
              <label className="col-span-2 text-xs font-semibold">图片地址<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] px-3 text-sm" name={`imageUrl.${index}`} defaultValue={item.imageUrl} /></label>
              <input name={`productUrl.${index}`} type="hidden" value={item.productUrl ?? ""} />
            </div>
          </fieldset>
        ))}
      </div>
      <button className="h-12 rounded-xl bg-[var(--green)] px-7 font-semibold text-white" type="submit">确认并导入订单</button>
    </form>
  );
}

export default async function EventDetailPage({ params, searchParams }: EventPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const [{ data: event }, { data: orders }] = await Promise.all([
    supabase.from("mail_events").select("*").eq("id", id).single(),
    supabase
      .from("orders")
      .select("id,external_order_id,effective_total,currency,cancelled_at,order_items(id,album_title,artist_name,cancelled_at)")
      .order("ordered_at", { ascending: false })
  ]);
  if (!event) notFound();

  const parsed = mailEventPayloadSchema.safeParse(event.parsed_payload);
  const activeOrders = (orders ?? []).filter((order) => !order.cancelled_at);
  const defaultOrderId = event.related_order_id ?? activeOrders.find((order) => order.external_order_id === event.external_order_id)?.id;

  return (
    <section>
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Mail event</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{event.subject}</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{event.sender} · {new Date(event.received_at).toLocaleString("zh-CN")}</p>
      {query.error ? <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">{String(query.error)}</div> : null}

      <div className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-8">
        {event.status === "failed" ? (
          <div>
            <h2 className="text-xl font-semibold">这封邮件暂时无法解析</h2>
            <p className="mt-2 text-[var(--muted)]">修复规则后可以重新从 QQ 邮箱读取，正文不会保存在数据库。</p>
            <div className="mt-6 flex gap-3">
              <form action={retryFailedEventAction.bind(null, id)}><button className="h-11 rounded-xl bg-[var(--green)] px-5 font-semibold text-white">重新解析</button></form>
              <form action={ignoreEventAction.bind(null, id)}><button className="h-11 rounded-xl border border-[var(--line)] px-5 font-semibold">忽略</button></form>
            </div>
          </div>
        ) : !parsed.success ? (
          <p className="text-red-700">结构化内容不完整，请重新解析该邮件。</p>
        ) : parsed.data.type === "order_confirmation" ? (
          <OrderConfirmationForm eventId={id} payload={parsed.data} />
        ) : parsed.data.type === "shipment" ? (
          <form action={applyShipmentAction.bind(null, id)} className="space-y-5">
            <h2 className="text-xl font-semibold">确认对应订单已经发货</h2>
            <select className="h-12 w-full rounded-xl border border-[var(--line)] bg-white px-3" name="orderId" defaultValue={defaultOrderId} required>
              <option value="" disabled>选择订单</option>
              {activeOrders.map((order) => <option key={order.id} value={order.id}>#{order.external_order_id} · {order.currency} {order.effective_total}</option>)}
            </select>
            <button className="h-12 rounded-xl bg-[var(--green)] px-6 font-semibold text-white">确认已发货</button>
          </form>
        ) : (
          <div>
            <h2 className="mb-5 text-xl font-semibold">确认取消范围</h2>
            <CancellationEventForm eventId={id} orders={activeOrders} defaultOrderId={defaultOrderId} />
          </div>
        )}
      </div>
      {event.status !== "failed" ? <form action={ignoreEventAction.bind(null, id)} className="mt-4"><button className="text-sm font-semibold text-[var(--muted)] underline">这不是需要处理的邮件，忽略它</button></form> : null}
    </section>
  );
}
