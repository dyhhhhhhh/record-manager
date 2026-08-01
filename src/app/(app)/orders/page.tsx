import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";

import { CustomSelect, type CustomSelectOption } from "@/components/custom-select";
import { ImportOrderButton } from "@/components/import-order-button";
import { OrderStatus } from "@/components/order-status";
import { SyncMailButton } from "@/components/sync-mail-button";
import { importOrderFromListAction } from "@/features/orders/import-actions";
import {
  buildUnifiedOrderRows,
  filterUnifiedOrderRows,
  type UnifiedMailEvent,
  type UnifiedStoredOrder
} from "@/features/orders/unified-orders";
import { formatShanghaiDate, formatShanghaiDateTime } from "@/lib/date-time";
import { clampPage } from "@/lib/pagination";
import { requireSupabaseData } from "@/lib/supabase/query-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OrdersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STATUS_OPTIONS = [
  { value: "all", label: "全部", tone: "neutral" },
  { value: "pending_import", label: "待导入", tone: "blue" },
  { value: "ordered", label: "未发货", tone: "amber" },
  { value: "shipped", label: "已发货", tone: "green" },
  { value: "received", label: "已收到", tone: "teal" },
  { value: "cancelled", label: "已取消", tone: "red" },
  { value: "failed", label: "解析失败", tone: "orange" }
] as const satisfies readonly CustomSelectOption[];

const EVENT_LABELS = {
  order_confirmation: "下单",
  shipment: "发货",
  cancellation: "取消"
} as const;

function pageHref(query: string, status: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/orders?${suffix}` : "/orders";
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const requestedStatus = typeof params.status === "string" ? params.status : "all";
  const status = STATUS_OPTIONS.some((option) => option.value === requestedStatus) ? requestedStatus : "all";
  const supabase = await createSupabaseServerClient();
  const [eventResult, orderResult, syncStateResult] = await Promise.all([
    supabase
      .from("mail_events")
      .select("id,event_type,status,external_order_id,received_at,parsed_payload,parse_errors,related_order_id")
      .order("received_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id,external_order_id,ordered_at,currency,effective_total,fulfillment_status,cancelled_at,order_items(id,album_title,artist_name,cancelled_at)")
      .order("ordered_at", { ascending: false }),
    supabase.from("mail_sync_state").select("last_synced_at").maybeSingle()
  ]);
  const events = (requireSupabaseData(eventResult, "读取订单邮件") ?? []) as UnifiedMailEvent[];
  const storedOrders = (requireSupabaseData(orderResult, "读取正式订单") ?? []) as UnifiedStoredOrder[];
  const syncState = requireSupabaseData(syncStateResult, "读取邮箱同步状态");
  const filtered = filterUnifiedOrderRows(buildUnifiedOrderRows(events, storedOrders), { query, status });
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = clampPage(typeof params.page === "string" ? params.page : undefined, pageCount);
  const orders = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section>
      <div className="flex flex-col justify-between gap-7 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Orders</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">订单</h1>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">每个订单号汇总下单、发货和取消邮件。只有导入后的唱片才会进入你的唱片簿和消费统计。</p>
        </div>
        <SyncMailButton lastSyncedAt={syncState?.last_synced_at ? formatShanghaiDateTime(syncState.last_synced_at) : null} />
      </div>

      {params.error ? <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">{String(params.error)}</div> : null}

      <form className="mt-8 grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="flex h-12 min-w-0 items-center rounded-2xl bg-white px-3">
          <Search size={17} className="text-[var(--muted)]" />
          <input aria-label="搜索订单" className="min-w-0 flex-1 bg-transparent px-3 outline-none" defaultValue={query} name="q" placeholder="订单号、专辑或艺人" />
        </label>
        <CustomSelect ariaLabel="订单状态" defaultValue={status} name="status" options={STATUS_OPTIONS} />
        <button className="h-12 rounded-2xl bg-[var(--green)] px-6 font-semibold text-white">筛选</button>
      </form>

      <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_50px_rgb(35_43_37/0.05)]">
        {orders.length ? orders.map((order) => {
          const eventTypes = (["order_confirmation", "shipment", "cancellation"] as const)
            .filter((eventType) => order.events.some((event) => event.event_type === eventType));
          return (
            <article className="grid gap-4 border-b border-[var(--line)] p-4 last:border-b-0 hover:bg-white/60 sm:p-5 lg:grid-cols-[minmax(0,1fr)_120px_120px_120px_auto] lg:items-center" key={order.externalOrderId}>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <Link className="group inline-flex min-h-11 items-center gap-2 text-lg font-bold hover:text-[var(--green)]" href={`/orders/${encodeURIComponent(order.externalOrderId)}`}>
                  #{order.externalOrderId}<ArrowUpRight className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" size={16} />
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  {eventTypes.map((eventType) => (
                    <span className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]" key={eventType}>
                      {EVENT_LABELS[eventType]}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-black/[0.025] p-3 sm:grid-cols-3 lg:contents">
                <div className="min-w-0">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)] lg:sr-only">下单日期</span>
                  <time className="text-sm text-[var(--muted)]">{order.orderedAt ? formatShanghaiDate(order.orderedAt) : "—"}</time>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)] lg:sr-only">状态</span>
                  <OrderStatus state={order.state} />
                </div>
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)] lg:sr-only">金额</span>
                  <strong>{order.currency && order.total ? `${order.currency} ${order.total}` : "—"}</strong>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                {order.canImport && order.confirmationEventId ? (
                  <form action={importOrderFromListAction.bind(null, order.confirmationEventId)}>
                    <ImportOrderButton compact />
                  </form>
                ) : null}
                <Link className="inline-flex h-11 items-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-semibold" href={`/orders/${encodeURIComponent(order.externalOrderId)}`}>详情</Link>
              </div>
            </article>
          );
        }) : <p className="p-16 text-center text-[var(--muted)]">没有符合条件的订单。</p>}
      </div>

      {pageCount > 1 ? <nav className="mt-8 flex justify-center gap-3 text-sm font-semibold" aria-label="订单分页">
        {page > 1 ? <Link className="rounded-full border border-[var(--line)] bg-white px-4 py-2" href={pageHref(query, status, page - 1)}>上一页</Link> : null}
        <span className="px-2 py-2">{page} / {pageCount}</span>
        {page < pageCount ? <Link className="rounded-full border border-[var(--line)] bg-white px-4 py-2" href={pageHref(query, status, page + 1)}>下一页</Link> : null}
      </nav> : null}
    </section>
  );
}
