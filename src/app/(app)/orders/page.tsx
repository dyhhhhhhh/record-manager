import { Search } from "lucide-react";
import Link from "next/link";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type OrdersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STATUS_OPTIONS = [
  ["all", "全部"], ["ordered", "未发货"], ["shipped", "已发货"], ["received", "已收到"], ["cancelled", "已取消"]
] as const;

const LABELS: Record<string, string> = { ordered: "未发货", shipped: "已发货", received: "已收到" };

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().toLocaleLowerCase() : "";
  const status = typeof params.status === "string" ? params.status : "all";
  const page = Math.max(1, Number(params.page) || 1);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("orders")
    .select("id,external_order_id,ordered_at,currency,effective_total,fulfillment_status,cancelled_at,order_items(id,album_title,artist_name,cancelled_at)")
    .order("ordered_at", { ascending: false });

  const filtered = (data ?? []).filter((order) => {
    const matchesStatus = status === "all"
      || (status === "cancelled" ? Boolean(order.cancelled_at) : !order.cancelled_at && order.fulfillment_status === status);
    const matchesQuery = !query || order.external_order_id.toLocaleLowerCase().includes(query)
      || order.order_items.some((item) => [item.album_title, item.artist_name].some((value) => value.toLocaleLowerCase().includes(query)));
    return matchesStatus && matchesQuery;
  });
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const orders = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section>
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Orders</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">订单</h1>

      <form className="mt-8 flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 sm:flex-row">
        <label className="flex h-11 flex-1 items-center rounded-xl bg-white px-3">
          <Search size={17} className="text-[var(--muted)]" />
          <input aria-label="搜索订单" className="min-w-0 flex-1 bg-transparent px-3 outline-none" defaultValue={query} name="q" placeholder="订单号、专辑或艺人" />
        </label>
        <select className="h-11 rounded-xl border border-[var(--line)] bg-white px-3" defaultValue={status} name="status">
          {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="h-11 rounded-xl bg-[var(--green)] px-6 font-semibold text-white">筛选</button>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        {orders.length ? orders.map((order) => {
          const activeItems = order.order_items.filter((item) => !item.cancelled_at);
          return (
            <Link className="grid gap-3 border-b border-[var(--line)] p-5 last:border-b-0 hover:bg-white/70 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center" href={`/orders/${order.id}`} key={order.id}>
              <div>
                <strong className="text-lg">#{order.external_order_id}</strong>
                <p className="mt-1 line-clamp-1 text-sm text-[var(--muted)]">{activeItems.map((item) => `${item.artist_name} · ${item.album_title}`).join("、") || "没有有效唱片"}</p>
              </div>
              <time className="text-sm text-[var(--muted)]">{new Date(order.ordered_at).toLocaleDateString("zh-CN")}</time>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${order.cancelled_at ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
                {order.cancelled_at ? "已取消" : LABELS[order.fulfillment_status]}
              </span>
              <strong>{order.currency} {order.effective_total}</strong>
            </Link>
          );
        }) : <p className="p-16 text-center text-[var(--muted)]">没有符合条件的订单。</p>}
      </div>

      {pageCount > 1 ? <nav className="mt-8 flex justify-center gap-3 text-sm font-semibold">
        {page > 1 ? <Link className="rounded-full border border-[var(--line)] bg-white px-4 py-2" href={`/orders?q=${encodeURIComponent(query)}&status=${status}&page=${page - 1}`}>上一页</Link> : null}
        <span className="px-2 py-2">{page} / {pageCount}</span>
        {page < pageCount ? <Link className="rounded-full border border-[var(--line)] bg-white px-4 py-2" href={`/orders?q=${encodeURIComponent(query)}&status=${status}&page=${page + 1}`}>下一页</Link> : null}
      </nav> : null}
    </section>
  );
}
