import { CircleCheck, CircleX, Clock3, Download, TriangleAlert, Truck } from "lucide-react";

import type { UnifiedOrderState } from "@/features/orders/unified-orders";

const STATUS_CONFIG = {
  pending_import: { label: "待导入", icon: Download, className: "bg-blue-50 text-blue-800" },
  ordered: { label: "未发货", icon: Clock3, className: "bg-amber-50 text-amber-800" },
  shipped: { label: "已发货", icon: Truck, className: "bg-emerald-50 text-emerald-800" },
  received: { label: "已收到", icon: CircleCheck, className: "bg-teal-50 text-teal-900" },
  cancelled: { label: "已取消", icon: CircleX, className: "bg-red-50 text-red-800" },
  failed: { label: "解析失败", icon: TriangleAlert, className: "bg-orange-50 text-orange-800" }
} as const;

export function OrderStatus({ state }: { state: UnifiedOrderState }) {
  const config = STATUS_CONFIG[state];
  const Icon = config.icon;
  return (
    <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${config.className}`} role="status">
      <Icon aria-hidden="true" size={15} />
      <span>{config.label}</span>
    </span>
  );
}
