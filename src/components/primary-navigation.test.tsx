import { fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ResponsiveNavigation } from "@/components/primary-navigation";

let pathname = "/orders";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new window.Event("close"));
  };
});

afterEach(() => {
  pathname = "/orders";
  document.body.style.overflow = "";
});

describe("ResponsiveNavigation", () => {
  it("shows the complete desktop navigation with icons and current-page state", () => {
    const { container, rerender } = render(<ResponsiveNavigation signOutAction={vi.fn()} />);
    const desktop = within(container).getByRole("navigation", { name: "桌面主要导航" });
    const view = within(desktop);
    const collection = view.getByRole("link", { name: "唱片" });
    const orders = view.getByRole("link", { name: "订单" });

    expect(collection.querySelector(".lucide-disc-3")).toBeInTheDocument();
    expect(orders.querySelector(".lucide-package-search")).toBeInTheDocument();
    expect(orders).toHaveAttribute("aria-current", "page");
    expect(within(container).getByRole("button", { name: "退出登录" })).toBeInTheDocument();

    pathname = "/";
    rerender(<ResponsiveNavigation signOutAction={vi.fn()} />);
    expect(within(desktop).getByRole("link", { name: "唱片" })).toHaveAttribute("aria-current", "page");
  });

  it("opens an accessible drawer and restores focus and scrolling when closed", () => {
    const { container } = render(<ResponsiveNavigation signOutAction={vi.fn()} />);
    const view = within(container);
    const trigger = view.getByRole("button", { name: "打开导航菜单" });

    trigger.focus();
    fireEvent.click(trigger);
    const dialog = view.getByRole("dialog", { name: "导航菜单" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭导航菜单" }));
    expect(view.queryByRole("dialog", { name: "导航菜单" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
  });

  it("closes through the backdrop, Escape cancellation, or a navigation choice", () => {
    const { container } = render(<ResponsiveNavigation signOutAction={vi.fn()} />);
    const view = within(container);
    const trigger = view.getByRole("button", { name: "打开导航菜单" });

    fireEvent.click(trigger);
    let dialog = view.getByRole("dialog", { name: "导航菜单" });
    fireEvent.click(dialog);
    expect(view.queryByRole("dialog", { name: "导航菜单" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    dialog = view.getByRole("dialog", { name: "导航菜单" });
    fireEvent(dialog, new window.Event("cancel", { cancelable: true }));
    expect(view.queryByRole("dialog", { name: "导航菜单" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    dialog = view.getByRole("dialog", { name: "导航菜单" });
    const drawer = within(dialog);
    expect(drawer.getByRole("link", { name: "订单" })).toHaveAttribute("aria-current", "page");
    expect(drawer.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
    fireEvent.click(drawer.getByRole("link", { name: "唱片" }));
    expect(view.queryByRole("dialog", { name: "导航菜单" })).not.toBeInTheDocument();
  });
});
