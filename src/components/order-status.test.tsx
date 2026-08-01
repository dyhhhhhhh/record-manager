import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OrderStatus } from "@/components/order-status";
import type { UnifiedOrderState } from "@/features/orders/unified-orders";

describe("OrderStatus", () => {
  it("uses a distinct icon with readable text for every order state", () => {
    const cases: Array<[UnifiedOrderState, string, string]> = [
      ["pending_import", "待导入", "lucide-download"],
      ["ordered", "未发货", "lucide-clock-3"],
      ["shipped", "已发货", "lucide-truck"],
      ["received", "已收到", "lucide-circle-check"],
      ["cancelled", "已取消", "lucide-circle-x"],
      ["failed", "解析失败", "lucide-triangle-alert"]
    ];

    for (const [state, label, iconClass] of cases) {
      const { container, unmount } = render(<OrderStatus state={state} />);
      expect(within(container).getByText(label)).toBeInTheDocument();
      expect(container.querySelector(`.${iconClass}`)).toBeInTheDocument();
      unmount();
    }
  });
});
