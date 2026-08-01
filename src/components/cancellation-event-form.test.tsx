import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/inbox/actions", () => ({ applyCancellationAction: vi.fn() }));

import { CancellationEventForm } from "@/components/cancellation-event-form";

const orders = [
  {
    id: "order-one",
    external_order_id: "1001",
    effective_total: "300.00",
    currency: "CNY",
    order_items: [{ id: "item-one", album_title: "First", artist_name: "Artist", cancelled_at: null }]
  },
  {
    id: "order-two",
    external_order_id: "1002",
    effective_total: "80.00",
    currency: "CNY",
    order_items: [{ id: "item-two", album_title: "Second", artist_name: "Artist", cancelled_at: null }]
  }
];

describe("cancellation event form", () => {
  it("resets item and adjusted total when the selected order changes", () => {
    render(<CancellationEventForm eventId="event" orders={orders} defaultOrderId="order-one" />);

    fireEvent.change(screen.getByLabelText("取消范围"), { target: { value: "item" } });
    expect(screen.getByLabelText("取消后的订单实付")).toHaveValue("300.00");
    expect(screen.getByLabelText("被取消的唱片")).toHaveValue("item-one");

    fireEvent.change(screen.getByLabelText("对应订单"), { target: { value: "order-two" } });
    expect(screen.getByLabelText("取消后的订单实付")).toHaveValue("80.00");
    expect(screen.getByLabelText("被取消的唱片")).toHaveValue("item-two");
  });
});
