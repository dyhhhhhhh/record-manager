import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  events: [] as Record<string, unknown>[],
  orders: [] as Record<string, unknown>[]
}));

vi.mock("server-only", () => ({}));
vi.mock("@/components/sync-mail-button", () => ({
  SyncMailButton: () => <div data-testid="sync-mail" />
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(table: string) {
      if (table === "mail_sync_state") {
        return {
          select: () => ({
            maybeSingle: async () => ({ data: null, error: null })
          })
        };
      }

      const data = table === "mail_events" ? database.events : database.orders;
      return {
        select: () => ({
          order: async () => ({ data, error: null })
        })
      };
    }
  })
}));

import OrdersPage from "@/app/(app)/orders/page";

function confirmation(index: number, merchant: "hmv" | "laced" = "hmv") {
  return {
    id: `${merchant}-${index}`,
    merchant,
    event_type: "order_confirmation",
    status: "pending",
    external_order_id: String(90000000 + index),
    received_at: `2026-07-${String(index).padStart(2, "0")}T03:27:10.000Z`,
    parsed_payload: {
      merchant,
      type: "order_confirmation",
      externalOrderId: String(90000000 + index),
      occurredAt: `2026-07-${String(index).padStart(2, "0")}T03:27:10.000Z`,
      currency: "JPY",
      itemsSubtotal: "1000",
      shippingTotal: "0",
      shippingMethod: "配送",
      discountTotal: "0",
      taxTotal: "0",
      total: "1000",
      items: [{ albumTitle: `Album ${index}`, artistName: "Artist", unitPrice: "1000", quantity: 1 }]
    },
    parse_errors: [],
    related_order_id: null
  };
}

describe("orders page filters", () => {
  beforeEach(() => {
    database.events = Array.from({ length: 26 }, (_, index) => confirmation(index + 1));
    database.orders = [];
  });

  afterEach(cleanup);

  it("shows merchant and status controls and preserves all filters in pagination", async () => {
    render(await OrdersPage({
      searchParams: Promise.resolve({ q: "album", merchant: "hmv", status: "pending_import" })
    }));

    expect(screen.getByRole("combobox", { name: "订单厂商" })).toHaveTextContent("HMV Japan");
    expect(screen.getByRole("combobox", { name: "订单状态" })).toHaveTextContent("待导入");
    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "href",
      "/orders?q=album&merchant=hmv&status=pending_import&page=2"
    );
  }, 10_000);

  it("offers all six merchants in the filter", async () => {
    render(await OrdersPage({ searchParams: Promise.resolve({}) }));
    fireEvent.click(screen.getByRole("combobox", { name: "订单厂商" }));

    const options = within(screen.getByRole("listbox", { name: "订单厂商选项" }))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "全部厂商",
      "iMusic",
      "HMV Japan",
      "Mutant",
      "Black Screen Records",
      "Laced Records",
      "CDJapan"
    ]);
  });

  it("keeps a new merchant filter in pagination links", async () => {
    database.events = Array.from({ length: 26 }, (_, index) => confirmation(index + 1, "laced"));
    render(await OrdersPage({
      searchParams: Promise.resolve({ merchant: "laced", status: "pending_import" })
    }));

    expect(screen.getByRole("combobox", { name: "订单厂商" })).toHaveTextContent("Laced Records");
    expect(screen.getByRole("link", { name: "下一页" })).toHaveAttribute(
      "href",
      "/orders?merchant=laced&status=pending_import&page=2"
    );
  });
});
