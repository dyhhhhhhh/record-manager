"use client";

import { useMemo, useState } from "react";

import { applyCancellationAction } from "@/features/inbox/actions";

type SelectableOrder = {
  id: string;
  external_order_id: string;
  effective_total: string;
  currency: string;
  order_items: Array<{ id: string; album_title: string; artist_name: string; cancelled_at: string | null }>;
};

export function CancellationEventForm({
  eventId,
  orders,
  defaultOrderId
}: {
  eventId: string;
  orders: SelectableOrder[];
  defaultOrderId?: string;
}) {
  const [orderId, setOrderId] = useState(defaultOrderId ?? orders[0]?.id ?? "");
  const [scope, setScope] = useState("order");
  const selected = useMemo(() => orders.find((order) => order.id === orderId), [orderId, orders]);

  return (
    <form action={applyCancellationAction.bind(null, eventId)} className="space-y-5">
      <label className="block text-sm font-semibold">
        对应订单
        <select className="mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-white px-3" name="orderId" onChange={(event) => setOrderId(event.target.value)} value={orderId}>
          {orders.map((order) => <option key={order.id} value={order.id}>#{order.external_order_id} · {order.currency} {order.effective_total}</option>)}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        取消范围
        <select className="mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-white px-3" name="scope" onChange={(event) => setScope(event.target.value)} value={scope}>
          <option value="order">整张订单</option>
          <option value="item">订单中的一张唱片</option>
        </select>
      </label>
      {scope === "item" ? (
        <>
          <label className="block text-sm font-semibold">
            被取消的唱片
            <select className="mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-white px-3" name="itemId" required>
              {selected?.order_items.filter((item) => !item.cancelled_at).map((item) => (
                <option key={item.id} value={item.id}>{item.artist_name} · {item.album_title}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            取消后的订单实付
            <input className="mt-2 h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4" name="effectiveTotal" pattern="\d+(\.\d{1,2})?" required defaultValue={selected?.effective_total} />
          </label>
        </>
      ) : null}
      <button className="h-12 rounded-xl bg-red-700 px-6 font-semibold text-white" type="submit">确认取消</button>
    </form>
  );
}
