import type { Merchant } from "@/types/domain";

type CollectionItem = {
  id: string;
  album_title: string;
  artist_name: string;
  unit_price: string | number;
  quantity: number;
  image_path: string | null;
  cancelled_at: string | null;
};

type CollectionOrder = {
  id: string;
  merchant: Merchant;
  external_order_id: string;
  ordered_at: string;
  currency: string;
  effective_total: string | number;
  shipping_total: string | number;
  tax_total: string | number;
  fulfillment_status: string;
  cancelled_at: string | null;
  order_items: readonly CollectionItem[];
};

function toMinorUnits(amount: string | number) {
  const [whole, fraction = ""] = String(amount).split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
}

function fromMinorUnits(amount: bigint) {
  const sign = amount < 0 ? "-" : "";
  const absolute = amount < 0 ? -amount : amount;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function buildCollection(orders: readonly CollectionOrder[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const activeOrders = orders.filter((order) => !order.cancelled_at);
  const statsMap = new Map<string, {
    total: bigint;
    recordsTotal: bigint;
    shippingTotal: bigint;
    taxTotal: bigint;
    orderCount: number;
    recordCount: number;
  }>();

  for (const order of activeOrders) {
    const activeItems = order.order_items.filter((item) => !item.cancelled_at);
    const current = statsMap.get(order.currency) ?? {
      total: 0n,
      recordsTotal: 0n,
      shippingTotal: 0n,
      taxTotal: 0n,
      orderCount: 0,
      recordCount: 0
    };
    current.total += toMinorUnits(order.effective_total);
    current.recordsTotal += activeItems.reduce(
      (sum, item) => sum + toMinorUnits(item.unit_price) * BigInt(item.quantity),
      0n
    );
    current.shippingTotal += toMinorUnits(order.shipping_total);
    current.taxTotal += toMinorUnits(order.tax_total);
    current.orderCount += 1;
    current.recordCount += activeItems.reduce((sum, item) => sum + item.quantity, 0);
    statsMap.set(order.currency, current);
  }

  const records = activeOrders
    .flatMap((order) =>
      order.order_items
        .filter((item) => !item.cancelled_at)
        .map((item) => ({
          ...item,
          order_id: order.id,
          merchant: order.merchant,
          external_order_id: order.external_order_id,
          ordered_at: order.ordered_at,
          currency: order.currency,
          fulfillment_status: order.fulfillment_status
        }))
    )
    .filter((record) => {
      if (!normalizedQuery) return true;
      return [record.album_title, record.artist_name, record.external_order_id]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) => Date.parse(b.ordered_at) - Date.parse(a.ordered_at));

  const stats = Array.from(statsMap, ([currency, value]) => ({
    currency,
    total: fromMinorUnits(value.total),
    recordsTotal: fromMinorUnits(value.recordsTotal),
    shippingTotal: fromMinorUnits(value.shippingTotal),
    taxTotal: fromMinorUnits(value.taxTotal),
    orderCount: value.orderCount,
    recordCount: value.recordCount
  })).sort((a, b) => a.currency.localeCompare(b.currency));

  return { records, stats };
}
