import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderListRow } from "@/components/order-list-row";
import type { UnifiedOrderRow } from "@/features/orders/unified-orders";

vi.mock("@/features/orders/import-actions", () => ({
  importOrderFromListAction: vi.fn()
}));

const storedOrder: UnifiedOrderRow = {
  merchant: "imusic",
  externalOrderId: "13772603",
  orderId: "stored-order",
  confirmationEventId: null,
  orderedAt: "2026-07-29T00:00:00Z",
  currency: "CNY",
  total: "2146.00",
  state: "ordered",
  canImport: false,
  items: [],
  payload: null,
  events: []
};

describe("OrderListRow", () => {
  it("places the single mobile action group beside the order identity", () => {
    const { container } = render(<OrderListRow order={storedOrder} />);
    const view = within(container);

    const row = view.getByRole("article", { name: "订单 13772603" });
    const actions = view.getByRole("group", { name: "订单操作" });
    const information = view.getByRole("group", { name: "订单信息" });

    expect(row).toHaveClass(
      "grid-cols-[minmax(0,1fr)_auto]",
      "lg:grid-cols-[minmax(0,1fr)_120px_120px_120px_auto]"
    );
    expect(actions).toHaveClass(
      "col-start-2",
      "row-start-1",
      "flex-col",
      "min-[360px]:flex-row",
      "md:col-start-auto",
      "md:row-start-auto"
    );
    expect(information).toHaveClass(
      "col-span-2",
      "row-start-2",
      "md:col-span-1",
      "lg:contents"
    );
    expect(view.getAllByRole("link", { name: "详情" })).toHaveLength(1);
  });

  it("keeps import and detail together without duplicating either action", () => {
    const { container } = render(
      <OrderListRow
        order={{
          ...storedOrder,
          orderId: null,
          confirmationEventId: "event-1",
          state: "pending_import",
          canImport: true
        }}
      />
    );
    const view = within(container);

    expect(view.getAllByRole("button", { name: "导入" })).toHaveLength(1);
    expect(view.getAllByRole("link", { name: "详情" })).toHaveLength(1);
  });

  it("shows the merchant and links to the merchant-scoped detail route", () => {
    const { container } = render(<OrderListRow order={{ ...storedOrder, merchant: "hmv" }} />);
    const view = within(container);

    expect(view.getByText("HMV Japan")).toBeInTheDocument();
    expect(view.getByRole("link", { name: /13772603/ })).toHaveAttribute("href", "/orders/hmv/13772603");
    expect(view.getByRole("link", { name: "详情" })).toHaveAttribute("href", "/orders/hmv/13772603");
  });
});
