import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderCancellationForm } from "@/components/order-cancellation-form";

describe("order cancellation form", () => {
  it("renders the standard whole-order cancellation control", () => {
    render(<OrderCancellationForm action={vi.fn()} cancelled={false} />);

    expect(screen.getByRole("heading", { name: "取消整张订单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认取消订单" })).toBeInTheDocument();
  });

  it("switches to the restoration control for a cancelled order", () => {
    render(<OrderCancellationForm action={vi.fn()} cancelled />);

    expect(screen.getByRole("heading", { name: "恢复整张订单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认恢复订单" })).toBeInTheDocument();
  });
});
