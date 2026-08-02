import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { ImportOrderButton } from "@/components/import-order-button";
import { OrderStatus } from "@/components/order-status";
import { importOrderFromListAction } from "@/features/orders/import-actions";
import type { UnifiedOrderRow } from "@/features/orders/unified-orders";
import { formatShanghaiDate } from "@/lib/date-time";
import { MERCHANT_LABELS, orderDetailHref } from "@/lib/merchant";

const EVENT_LABELS = {
  order_confirmation: "下单",
  shipment: "发货",
  cancellation: "取消"
} as const;

export function OrderListRow({ order }: { order: UnifiedOrderRow }) {
  const eventTypes = (["order_confirmation", "shipment", "cancellation"] as const)
    .filter((eventType) => order.events.some((event) => event.event_type === eventType));
  const detailHref = orderDetailHref(order.merchant, order.externalOrderId);

  return (
    <article
      aria-label={`订单 ${order.externalOrderId}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[var(--line)] p-4 last:border-b-0 hover:bg-white/60 sm:p-5 md:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_120px_120px_120px_auto] lg:items-center"
    >
      <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:col-start-auto md:row-start-auto">
        <Link className="group inline-flex min-h-11 shrink-0 items-center gap-2 text-lg font-bold hover:text-[var(--green)]" href={detailHref}>
          #{order.externalOrderId}<ArrowUpRight aria-hidden="true" className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" size={16} />
        </Link>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <span className="rounded-full bg-black/[0.055] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
            {MERCHANT_LABELS[order.merchant]}
          </span>
          {eventTypes.map((eventType) => (
            <span className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]" key={eventType}>
              {EVENT_LABELS[eventType]}
            </span>
          ))}
        </div>
      </div>

      <div aria-label="订单信息" className="col-span-2 row-start-2 grid grid-cols-2 gap-3 rounded-2xl bg-black/[0.025] p-3 sm:grid-cols-3 md:col-span-1 md:row-start-auto lg:contents" role="group">
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

      <div aria-label="订单操作" className="col-start-2 row-start-1 flex shrink-0 flex-col items-end justify-end gap-2 self-start min-[360px]:flex-row min-[360px]:items-center md:col-span-1 md:col-start-auto md:row-start-auto md:self-auto lg:self-center" role="group">
        {order.canImport && order.confirmationEventId ? (
          <form action={importOrderFromListAction.bind(null, order.confirmationEventId)}>
            <ImportOrderButton compact />
          </form>
        ) : null}
        <Link className="inline-flex h-11 shrink-0 items-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-semibold" href={detailHref}>详情</Link>
      </div>
    </article>
  );
}
