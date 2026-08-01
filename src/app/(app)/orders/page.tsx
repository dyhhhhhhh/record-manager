import { ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";

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
  ["all", "全部"],
  ["pending_import", "待导入"],
  ["ordered", "未发货"],
  ["shipped", "已发货"],
  ["received", "已收到"],
  ["cancelled", "已取消"],
  ["failed", "解析失败"]
] as const;

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
  const status = STATUS_OPTIONS.some(([value]) => value === requestedStatus) ? requestedStatus : "all";
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

      <form className="mt-8 flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 sm:flex-row">
        <label className="flex h-11 flex-1 items-center rounded-xl bg-white px-3">
          <Search size={17} className="text-[var(--muted)]" />
          <input aria-label="搜索订单" className="min-w-0 flex-1 bg-transparent px-3 outline-none" defaultValue={query} name="q" placeholder="订单号、专辑或艺人" />
        </label>
        <select aria-label="订单状态" className="h-11 rounded-xl border border-[var(--line)] bg-white px-3" defaultValue={status} name="status">
          {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="h-11 rounded-xl bg-[var(--green)] px-6 font-semibold text-white">筛选</button>
      </form>

      <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_50px_rgb(35_43_37/0.05)]">
        {orders.length ? orders.map((order) => {
          const activeItems = order.items.filter((item) => !item.cancelledAt);
          const eventTypes = (["order_confirmation", "shipment", "cancellation"] as const)
            .filter((eventType) => order.events.some((event) => event.event_type === eventType));
          return (
            <article className="grid gap-4 border-b border-[var(--line)] p-5 last:border-b-0 hover:bg-white/60 lg:grid-cols-[minmax(0,1fr)_120px_120px_120px_auto] lg:items-center" key={order.externalOrderId}>
              <div className="min-w-0">
                <Link className="group inline-flex items-center gap-2 text-lg font-bold hover:text-[var(--green)]" href={`/orders/${encodeURIComponent(order.externalOrderId)}`}>
                  #{order.externalOrderId}<ArrowUpRight className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" size={16} />
                </Link>
                <p className="mt-1 line-clamp-1 text-sm text-[var(--muted)]">
                  {activeItems.map((item) => `${item.artistName} · ${item.albumTitle}`).join("、") || "没有可展示的唱片信息"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {eventTypes.map((eventType) => (
                    <span className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]" key={eventType}>
                      {EVENT_LABELS[eventType]}
                    </span>
                  ))}
                </div>
              </div>
              <time className="text-sm text-[var(--muted)]">{order.orderedAt ? formatShanghaiDate(order.orderedAt) : "—"}</time>
              <OrderStatus state={order.state} />
              <strong>{order.currency && order.total ? `${order.currency} ${order.total}` : "—"}</strong>
              <div className="flex items-center gap-2 lg:justify-end">
                {order.canImport && order.confirmationEventId ? (
                  <form action={importOrderFromListAction.bind(null, order.confirmationEventId)}>
                    <ImportOrderButton compact />
                  </form>
                ) : null}
                <Link className="inline-flex h-10 items-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-semibold" href={`/orders/${encodeURIComponent(order.externalOrderId)}`}>详情</Link>
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
