import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrimaryNavigation } from "@/components/primary-navigation";

let pathname = "/orders";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname
}));

describe("PrimaryNavigation", () => {
  it("shows icon-labelled destinations and marks the current section", () => {
    const { container, rerender } = render(<PrimaryNavigation />);
    const view = within(container);
    const collection = view.getByRole("link", { name: "唱片" });
    const orders = view.getByRole("link", { name: "订单" });

    expect(collection.querySelector(".lucide-disc-3")).toBeInTheDocument();
    expect(orders.querySelector(".lucide-package-search")).toBeInTheDocument();
    expect(orders).toHaveAttribute("aria-current", "page");
    expect(collection).not.toHaveAttribute("aria-current");

    pathname = "/";
    rerender(<PrimaryNavigation />);
    expect(view.getByRole("link", { name: "唱片" })).toHaveAttribute("aria-current", "page");
  });
});
