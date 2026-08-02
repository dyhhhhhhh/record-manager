import { Mail, PackageX, Truck, Upload } from "lucide-react";
import { notFound } from "next/navigation";

import { CoverImage } from "@/components/cover-image";
import { CustomSelect, type CustomSelectOption } from "@/components/custom-select";
import { ImportOrderButton } from "@/components/import-order-button";
import { OrderStatus } from "@/components/order-status";
import { isTrustedCoverUrl } from "@/features/covers/trusted-cover-url";
import { importOrderFromDetailAction } from "@/features/orders/import-actions";
import {
  setFulfillmentAction,
  setItemCancellationAction,
  setOrderCancellationAction,
  updateOrderAction,
  updateOrderItemAction,
  uploadItemCoverAction
} from "@/features/orders/actions";
import { buildUnifiedOrderRows, type UnifiedMailEvent, type UnifiedStoredOrder } from "@/features/orders/unified-orders";
import { formatShanghaiDateTime, toShanghaiDateTimeInput } from "@/lib/date-time";
import { requireSupabaseData } from "@/lib/supabase/query-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MERCHANT_LABELS } from "@/lib/merchant";
import { merchantSchema } from "@/types/domain";

type OrderPageProps = {
  params: Promise<{ id: string; orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type TimelineEvent = UnifiedMailEvent & { subject: string };

const EVENT_CONFIG = {
  order_confirmation: { label: "下单确认", icon: Mail, className: "bg-blue-50 text-blue-800" },
  shipment: { label: "发货通知", icon: Truck, className: "bg-emerald-50 text-emerald-800" },
  cancellation: { label: "取消通知", icon: PackageX, className: "bg-red-50 text-red-800" }
} as const;

const EVENT_STATUS = {
  pending: "已检测",
  applied: "已应用",
  ignored: "已忽略",
  failed: "处理失败"
} as const;

function eventStatusLabel(event: TimelineEvent) {
  if (
    event.status === "pending"
    && event.event_type !== "order_confirmation"
    && !event.authentication_verified
  ) return "待手动核验";
  return EVENT_STATUS[event.status];
}

const FULFILLMENT_OPTIONS = [
  { value: "ordered", label: "未发货", tone: "amber" },
  { value: "shipped", label: "已发货", tone: "green" },
  { value: "received", label: "已收到", tone: "teal" }
] as const satisfies readonly CustomSelectOption[];

function MailTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return null;
  return (
    <section className="mt-8 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--muted)]">订单邮件记录</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {events.map((event) => {
          const config = EVENT_CONFIG[event.event_type];
          const Icon = config.icon;
          return (
            <article className="flex gap-3 rounded-2xl border border-[var(--line)] bg-white/70 p-3" key={event.id}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${config.className}`}><Icon size={17} /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <strong>{config.label}</strong>
                  <span className="text-xs text-[var(--muted)]">{eventStatusLabel(event)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-[var(--muted)]" title={event.subject}>{event.subject}</p>
                <time className="mt-1 block text-[11px] text-[var(--muted)]">{formatShanghaiDateTime(event.received_at)}</time>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Field({ label, name, defaultValue, type = "text", required = true }: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold">
      {label}
      <input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" defaultValue={defaultValue} name={name} required={required} type={type} />
    </label>
  );
}

export default async function OrderDetailPage({ params, searchParams }: OrderPageProps) {
  const [{ id: rawMerchant, orderId: externalOrderId }, query] = await Promise.all([params, searchParams]);
  const parsedMerchant = merchantSchema.safeParse(rawMerchant);
  if (!parsedMerchant.success) notFound();
  const merchant = parsedMerchant.data;
  const supabase = await createSupabaseServerClient();
  const [orderResult, eventResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id,merchant,external_order_id,ordered_at,currency,items_subtotal,shipping_total,shipping_method,discount_total,tax_total,original_total,effective_total,fulfillment_status,cancelled_at,order_items(*)")
      .eq("merchant", merchant)
      .eq("external_order_id", externalOrderId)
      .maybeSingle(),
    supabase
      .from("mail_events")
      .select("id,merchant,event_type,status,external_order_id,subject,received_at,parsed_payload,parse_errors,authentication_verified,related_order_id")
      .eq("merchant", merchant)
      .eq("external_order_id", externalOrderId)
      .order("received_at", { ascending: false })
  ]);
  const order = requireSupabaseData(orderResult, "读取订单详情");
  const events = (requireSupabaseData(eventResult, "读取订单邮件记录") ?? []) as TimelineEvent[];
  if (!order && !events.length) notFound();

  const modelEvents = events as UnifiedMailEvent[];
  const modelOrders = order ? [{
    id: order.id,
    merchant: order.merchant,
    external_order_id: order.external_order_id,
    ordered_at: order.ordered_at,
    currency: order.currency,
    effective_total: order.effective_total,
    fulfillment_status: order.fulfillment_status,
    cancelled_at: order.cancelled_at,
    order_items: order.order_items
  } as UnifiedStoredOrder] : [];
  const unified = buildUnifiedOrderRows(modelEvents, modelOrders)[0];
  if (!unified) notFound();

  const paths = order?.order_items.map((item) => item.image_path).filter((path): path is string => Boolean(path)) ?? [];
  const { data: signed } = paths.length
    ? await supabase.storage.from("album-covers").createSignedUrls(paths, 3600)
    : { data: [] };
  const images = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl]));

  return (
    <section>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">{MERCHANT_LABELS[merchant]} order</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">#{externalOrderId}</h1>
          <p className="mt-2 text-[var(--muted)]">{unified.orderedAt ? formatShanghaiDateTime(unified.orderedAt) : "时间待重新解析"} · {unified.items.length} 个条目</p>
        </div>
        <OrderStatus state={unified.state} />
      </div>

      {query.error ? <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">{String(query.error)}</div> : null}
      <MailTimeline events={events} />

      {order ? (
        <div className="mt-8 grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            {order.order_items.map((item) => {
              const image = item.image_path ? images.get(item.image_path) : null;
              return (
                <article className={`rounded-3xl border p-5 ${item.cancelled_at ? "border-red-200 bg-red-50/60" : "border-[var(--line)] bg-[var(--surface)]"}`} key={item.id}>
                  <div className="grid gap-5 sm:grid-cols-[140px_1fr]">
                    <div>
                      <div className="relative aspect-square overflow-hidden rounded-2xl bg-black/5">
                        <CoverImage alt={`${item.artist_name}《${item.album_title}》封面`} sizes="140px" src={image} />
                      </div>
                      <form action={uploadItemCoverAction.bind(null, order.id, merchant, externalOrderId, item.id)} className="mt-3">
                        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold">
                          <Upload size={14} />上传封面<input accept="image/jpeg,image/png,image/webp" className="sr-only" name="cover" type="file" required />
                        </label>
                        <button className="mt-2 w-full rounded-lg bg-black/5 py-2 text-xs font-semibold">保存上传</button>
                      </form>
                    </div>
                    <div>
                      <form action={updateOrderItemAction.bind(null, order.id, merchant, externalOrderId, item.id)} className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold sm:col-span-2">专辑<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="albumTitle" defaultValue={item.album_title} required /></label>
                        <label className="text-xs font-semibold sm:col-span-2">艺人<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="artistName" defaultValue={item.artist_name} required /></label>
                        <Field label={`单价（${order.currency}）`} name="unitPrice" defaultValue={item.unit_price} />
                        <Field label="数量" name="quantity" defaultValue={item.quantity} type="number" />
                        <button className="h-10 rounded-lg bg-[var(--green)] px-4 text-sm font-semibold text-white sm:col-span-2">保存唱片信息</button>
                      </form>
                      <form action={setItemCancellationAction.bind(null, order.id, merchant, externalOrderId, item.id, !item.cancelled_at)} className="mt-4 flex flex-col gap-2 rounded-xl border border-black/10 p-3 sm:flex-row sm:items-end">
                        <label className="flex-1 text-xs font-semibold">操作后的订单实付<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name="effectiveTotal" defaultValue={order.effective_total} required /></label>
                        <button className={`h-10 rounded-lg px-4 text-sm font-semibold text-white ${item.cancelled_at ? "bg-emerald-700" : "bg-red-700"}`}>
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
            <form action={updateOrderAction.bind(null, order.id, merchant, externalOrderId)} className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <h2 className="text-lg font-semibold">订单基础信息</h2>
              <Field label="订单 ID" name="externalOrderId" defaultValue={order.external_order_id} />
              <Field label="下单时间" name="orderedAt" type="datetime-local" defaultValue={toShanghaiDateTimeInput(order.ordered_at)} />
              <Field label="币种" name="currency" defaultValue={order.currency} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="唱片费用" name="itemsSubtotal" defaultValue={order.items_subtotal} />
                <Field label="邮费" name="shippingTotal" defaultValue={order.shipping_total} />
              </div>
              <Field label="配送方式" name="shippingMethod" defaultValue={order.shipping_method ?? ""} required={false} />
              <Field label="优惠" name="discountTotal" defaultValue={order.discount_total} />
              <Field label="税费（已包含）" name="taxTotal" defaultValue={order.tax_total} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="订单总额" name="originalTotal" defaultValue={order.original_total} />
                <Field label="当前实付" name="effectiveTotal" defaultValue={order.effective_total} />
              </div>
              <p className="text-xs leading-5 text-[var(--muted)]">订单总额 = 唱片费用 + 邮费 − 优惠；税费已经包含，不会再次相加。</p>
              <button className="h-10 w-full rounded-lg bg-[var(--green)] text-sm font-semibold text-white">保存订单信息</button>
            </form>

            <form action={setFulfillmentAction.bind(null, order.id, merchant, externalOrderId)} className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
              <h2 className="text-lg font-semibold">履约状态</h2>
              <CustomSelect ariaLabel="履约状态" className="mt-4" defaultValue={order.fulfillment_status} disabled={Boolean(order.cancelled_at)} name="status" options={FULFILLMENT_OPTIONS} />
              <button className="mt-3 h-10 w-full rounded-lg border border-[var(--line)] bg-white text-sm font-semibold disabled:opacity-50" disabled={Boolean(order.cancelled_at)}>更新状态</button>
            </form>

            <form action={setOrderCancellationAction.bind(null, order.id, merchant, externalOrderId, !order.cancelled_at)} className="rounded-3xl border border-red-200 bg-red-50 p-5">
              <h2 className="font-semibold text-red-900">{order.cancelled_at ? "恢复整张订单" : "取消整张订单"}</h2>
              <p className="mt-2 text-sm leading-6 text-red-800">{order.cancelled_at ? "恢复后，有效唱片会重新出现在首页并计入统计，履约状态保持不变。" : "订单内所有唱片会从首页隐藏，并从消费统计中排除。"}</p>
              <button className={`mt-4 h-10 w-full rounded-lg text-sm font-semibold text-white ${order.cancelled_at ? "bg-emerald-700" : "bg-red-700"}`}>{order.cancelled_at ? "确认恢复订单" : "确认取消订单"}</button>
            </form>
          </aside>
        </div>
      ) : unified.payload ? (
        <form action={importOrderFromDetailAction.bind(null, unified.confirmationEventId ?? "", merchant, externalOrderId)} className="mt-8 grid gap-5 xl:grid-cols-[1fr_340px]">
          <fieldset className="contents" disabled={!unified.canImport}>
            <input name="itemCount" type="hidden" value={unified.payload.items.length} />
            <div className="space-y-5">
              {unified.payload.items.map((item, index) => (
                <fieldset className="grid gap-5 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:grid-cols-[120px_1fr]" key={`${item.albumTitle}-${index}`}>
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-black/5">
                    <CoverImage alt={`${item.artistName}《${item.albumTitle}》封面`} sizes="120px" src={item.imageUrl && isTrustedCoverUrl(item.imageUrl, merchant) ? item.imageUrl : null} />
                  </div>
                  <div className="grid content-start gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold sm:col-span-2">专辑<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name={`albumTitle.${index}`} defaultValue={item.albumTitle} required /></label>
                    <label className="text-xs font-semibold sm:col-span-2">艺人<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name={`artistName.${index}`} defaultValue={item.artistName} required /></label>
                    <Field label="单价" name={`unitPrice.${index}`} defaultValue={item.unitPrice} />
                    <Field label="数量" name={`quantity.${index}`} defaultValue={item.quantity} type="number" />
                    <label className="text-xs font-semibold sm:col-span-2">图片地址<input className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm" name={`imageUrl.${index}`} defaultValue={item.imageUrl ?? ""} /></label>
                    <input name={`productUrl.${index}`} type="hidden" value={item.productUrl ?? ""} />
                  </div>
                </fieldset>
              ))}
            </div>

            <aside>
              <div className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">订单基础信息</h2>
                  {unified.canImport && unified.confirmationEventId ? <ImportOrderButton compact /> : null}
                </div>
                {!unified.canImport ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">该订单已有取消邮件，不能导入。</div> : null}
                <Field label="订单 ID" name="externalOrderId" defaultValue={unified.payload.externalOrderId} />
                <Field label="下单时间" name="orderedAt" type="datetime-local" defaultValue={toShanghaiDateTimeInput(unified.payload.occurredAt)} />
                <Field label="币种" name="currency" defaultValue={unified.payload.currency} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="唱片费用" name="itemsSubtotal" defaultValue={unified.payload.itemsSubtotal} />
                  <Field label="邮费" name="shippingTotal" defaultValue={unified.payload.shippingTotal} />
                </div>
                <Field label="配送方式" name="shippingMethod" defaultValue={unified.payload.shippingMethod} />
                <Field label="优惠" name="discountTotal" defaultValue={unified.payload.discountTotal} />
                <Field label="税费（已包含）" name="taxTotal" defaultValue={unified.payload.taxTotal} />
                <Field label="订单总额" name="total" defaultValue={unified.payload.total} />
                <p className="text-xs leading-5 text-[var(--muted)]">订单总额 = 唱片费用 + 邮费 − 优惠；税费已经包含，不会再次相加。</p>
              </div>
            </aside>
          </fieldset>
        </form>
      ) : unified.items.length ? (
        <div className="mt-8 rounded-3xl border border-red-200 bg-red-50/60 p-6">
          <h2 className="text-xl font-semibold text-red-900">该订单已取消，未导入唱片簿</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {unified.items.map((item, index) => (
              <article className="rounded-2xl border border-red-100 bg-white/70 p-4" key={`${item.albumTitle}-${index}`}>
                <h3 className="font-semibold">{item.albumTitle}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{item.artistName}</p>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-orange-200 bg-orange-50 p-8">
          <h2 className="text-xl font-semibold text-orange-900">订单邮件暂时无法解析</h2>
          <p className="mt-2 text-orange-800">请返回订单页，选择合适的时间范围后同步邮件。</p>
        </div>
      )}
    </section>
  );
}
