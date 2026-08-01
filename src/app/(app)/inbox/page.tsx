import { AlertTriangle, CheckCircle2, Mail, PackageCheck, PackageX } from "lucide-react";
import Link from "next/link";

import { SyncMailButton } from "@/components/sync-mail-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EVENT_LABELS = {
  order_confirmation: { label: "新订单", icon: Mail, color: "text-blue-700 bg-blue-50" },
  shipment: { label: "已发货", icon: PackageCheck, color: "text-emerald-700 bg-emerald-50" },
  cancellation: { label: "取消通知", icon: PackageX, color: "text-red-700 bg-red-50" }
} as const;

export default async function InboxPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: events }, { data: state }] = await Promise.all([
    supabase
      .from("mail_events")
      .select("id,event_type,status,external_order_id,subject,sender,received_at,parse_errors,related_order_id")
      .in("status", ["pending", "failed"])
      .order("received_at", { ascending: false }),
    supabase.from("mail_sync_state").select("last_synced_at,last_error").maybeSingle()
  ]);

  return (
    <section>
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--accent)]">Mail inbox</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">待你确认</h1>
          <p className="mt-3 text-[var(--muted)]">邮件只提供建议；订单和状态在你确认后才会改变。</p>
          {state?.last_synced_at ? <p className="mt-2 text-xs text-[var(--muted)]">上次同步：{new Date(state.last_synced_at).toLocaleString("zh-CN")}</p> : null}
        </div>
        <SyncMailButton />
      </div>

      <div className="mt-10 space-y-3">
        {events?.length ? events.map((event) => {
          const config = EVENT_LABELS[event.event_type as keyof typeof EVENT_LABELS];
          const Icon = event.status === "failed" ? AlertTriangle : config.icon;
          return (
            <Link className="group flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition hover:-translate-y-0.5 hover:shadow-lg" href={`/inbox/${event.id}`} key={event.id}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-full ${event.status === "failed" ? "bg-amber-50 text-amber-700" : config.color}`}><Icon size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong>{event.status === "failed" ? "解析失败" : config.label}</strong>
                  {event.external_order_id ? <span className="rounded-full bg-black/5 px-2 py-1 text-xs">#{event.external_order_id}</span> : null}
                  {event.related_order_id ? <CheckCircle2 className="text-emerald-700" size={15} /> : null}
                </span>
                <span className="mt-1 block truncate text-sm text-[var(--muted)]">{event.subject}</span>
              </span>
              <time className="hidden text-sm text-[var(--muted)] sm:block">{new Date(event.received_at).toLocaleDateString("zh-CN")}</time>
            </Link>
          );
        }) : (
          <div className="rounded-3xl border border-dashed border-[var(--line)] px-6 py-20 text-center">
            <CheckCircle2 className="mx-auto text-emerald-700" size={34} />
            <h2 className="mt-4 text-xl font-semibold">没有待处理邮件</h2>
            <p className="mt-2 text-[var(--muted)]">同步后，新订单和状态通知会出现在这里。</p>
          </div>
        )}
      </div>
    </section>
  );
}
