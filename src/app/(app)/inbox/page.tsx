import { AlertTriangle, CheckCircle2, Mail, PackageCheck, PackageX } from "lucide-react";
import Link from "next/link";

import { SyncMailButton } from "@/components/sync-mail-button";
import {
  filterMailEventGroups,
  groupMailEvents,
  type MailEventGroup,
  type MailEventListRow
} from "@/features/inbox/event-groups";
import { formatShanghaiDate, formatShanghaiDateTime } from "@/lib/date-time";
import { requireSupabaseData } from "@/lib/supabase/query-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EVENT_LABELS = {
  order_confirmation: { label: "新订单", icon: Mail, color: "text-blue-700 bg-blue-50" },
  shipment: { label: "已发货", icon: PackageCheck, color: "text-emerald-700 bg-emerald-50" },
  cancellation: { label: "取消通知", icon: PackageX, color: "text-red-700 bg-red-50" }
} as const;

const STATUS_LABELS = {
  pending: "待确认",
  applied: "已确认",
  ignored: "已忽略",
  failed: "解析失败"
} as const;

type InboxPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function groupStateLabel(
  group: MailEventGroup,
  order?: { fulfillment_status: string; cancelled_at: string | null }
) {
  if (order?.cancelled_at) return "已取消";
  if (order?.fulfillment_status === "received") return "已收到";
  if (order?.fulfillment_status === "shipped") return "已发货";
  if (order) return "已下单";
  if (group.events.some((event) => event.status === "failed")) return "需要修复解析";
  if (group.events.some((event) => event.event_type === "cancellation" && event.status === "pending")) return "待确认取消";
  if (group.events.some((event) => event.event_type === "shipment" && event.status === "pending")) return "待确认发货";
  return "待导入订单";
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const params = await searchParams;
  const view = params.view === "processed" ? "processed" : "pending";
  const supabase = await createSupabaseServerClient();
  const [eventResult, stateResult] = await Promise.all([
    supabase
      .from("mail_events")
      .select("id,event_type,status,external_order_id,subject,sender,received_at,parse_errors,related_order_id")
      .order("received_at", { ascending: false }),
    supabase.from("mail_sync_state").select("last_synced_at,last_error").maybeSingle()
  ]);
  const events = (requireSupabaseData(eventResult, "读取邮件事件") ?? []) as MailEventListRow[];
  const state = requireSupabaseData(stateResult, "读取邮箱同步状态");
  const allGroups = groupMailEvents(events);
  const groups = filterMailEventGroups(allGroups, view);
  const externalOrderIds = [...new Set(allGroups.flatMap((group) => group.externalOrderId ? [group.externalOrderId] : []))];
  const orderResult = externalOrderIds.length
    ? await supabase
        .from("orders")
        .select("external_order_id,fulfillment_status,cancelled_at")
        .in("external_order_id", externalOrderIds)
    : { data: [], error: null };
  const orders = requireSupabaseData(orderResult, "读取订单状态") ?? [];
  const ordersByExternalId = new Map(orders.map((order) => [order.external_order_id, order]));
  const pendingCount = allGroups.filter((group) => group.view === "pending").length;
  const processedCount = allGroups.length - pendingCount;

  return (
    <section>
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Mail inbox</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">订单邮件</h1>
          <p className="mt-3 text-[var(--muted)]">同一订单的下单、发货和取消邮件汇总在一行，状态仍由你确认后生效。</p>
          {state?.last_synced_at ? <p className="mt-2 text-xs text-[var(--muted)]">上次同步：{formatShanghaiDateTime(state.last_synced_at)}</p> : null}
        </div>
        <SyncMailButton />
      </div>

      <nav className="mt-8 flex gap-2" aria-label="邮件处理状态">
        <Link className={`rounded-full px-4 py-2 text-sm font-semibold ${view === "pending" ? "bg-[var(--green)] text-white" : "border border-[var(--line)] bg-white"}`} href="/inbox">
          待处理 {pendingCount}
        </Link>
        <Link className={`rounded-full px-4 py-2 text-sm font-semibold ${view === "processed" ? "bg-[var(--green)] text-white" : "border border-[var(--line)] bg-white"}`} href="/inbox?view=processed">
          已处理 {processedCount}
        </Link>
      </nav>

      <div className="mt-10 space-y-3">
        {groups.length ? groups.map((group) => {
          const primary = group.events.find((event) => event.id === group.primaryEventId) ?? group.events[0];
          const config = EVENT_LABELS[primary.event_type];
          const failed = group.events.some((event) => event.status === "failed");
          const Icon = failed ? AlertTriangle : config.icon;
          const order = group.externalOrderId ? ordersByExternalId.get(group.externalOrderId) : undefined;
          return (
            <Link className="group flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:-translate-y-0.5 hover:shadow-lg" href={`/inbox/${group.primaryEventId}`} key={group.key}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-full ${failed ? "bg-amber-50 text-amber-700" : config.color}`}><Icon size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong>{group.externalOrderId ? `订单 #${group.externalOrderId}` : "未识别订单号"}</strong>
                  <span className="rounded-full bg-black/5 px-2 py-1 text-xs font-semibold">{groupStateLabel(group, order)}</span>
                  {group.events.some((event) => event.related_order_id) ? <CheckCircle2 className="text-emerald-700" size={15} /> : null}
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {(["order_confirmation", "shipment", "cancellation"] as const).flatMap((eventType) => {
                    const matching = group.events.filter((event) => event.event_type === eventType);
                    if (!matching.length) return [];
                    const latest = matching[0];
                    return [
                      <span className="rounded-full border border-[var(--line)] bg-white px-2 py-1 text-xs text-[var(--muted)]" key={eventType}>
                        {EVENT_LABELS[eventType].label} · {STATUS_LABELS[latest.status]}{matching.length > 1 ? ` ×${matching.length}` : ""}
                      </span>
                    ];
                  })}
                </span>
              </span>
              <time className="hidden text-sm text-[var(--muted)] sm:block">{formatShanghaiDate(group.latestReceivedAt)}</time>
            </Link>
          );
        }) : (
          <div className="rounded-3xl border border-dashed border-[var(--line)] px-6 py-20 text-center">
            <CheckCircle2 className="mx-auto text-emerald-700" size={34} />
            <h2 className="mt-4 text-xl font-semibold">{view === "pending" ? "没有待处理订单邮件" : "还没有已处理邮件"}</h2>
            <p className="mt-2 text-[var(--muted)]">{view === "pending" ? "同步后，新订单和状态通知会出现在这里。" : "确认或忽略邮件后会归档到这里。"}</p>
          </div>
        )}
      </div>
    </section>
  );
}
