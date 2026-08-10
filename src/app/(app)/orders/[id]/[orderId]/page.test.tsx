import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  event: {} as Record<string, unknown>
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  }
}));
vi.mock("@/components/cover-image", () => ({ CoverImage: () => <div /> }));
vi.mock("@/features/orders/actions", () => ({
  setFulfillmentAction: vi.fn(),
  setItemCancellationAction: vi.fn(),
  setOrderCancellationAction: vi.fn(),
  setPendingOrderCancellationAction: vi.fn(),
  updateOrderAction: vi.fn(),
  updateOrderItemAction: vi.fn(),
  uploadItemCoverAction: vi.fn()
}));
vi.mock("@/features/orders/import-actions", () => ({
  importOrderFromDetailAction: vi.fn()
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(table: string) {
      const query = {
        eq: () => query,
        order: async () => ({
          data: table === "mail_events" ? [database.event] : [],
          error: null
        }),
        maybeSingle: async () => ({
          data: table === "orders" ? null : database.event,
          error: null
        })
      };
      return { select: () => query };
    },
    storage: {
      from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) })
    }
  })
}));

import OrderDetailPage from "@/app/(app)/orders/[id]/[orderId]/page";

const confirmation = {
  id: "confirmation-event",
  merchant: "cdjapan",
  event_type: "order_confirmation",
  status: "pending",
  external_order_id: "92000001",
  subject: "Order Confirmation #92000001",
  received_at: "2026-08-08T00:00:00.000Z",
  parsed_payload: {
    merchant: "cdjapan",
    type: "order_confirmation",
    externalOrderId: "92000001",
    occurredAt: "2026-08-08T00:00:00.000Z",
    currency: "JPY",
    itemsSubtotal: "1000",
    shippingTotal: "100",
    additionalFeeTotal: "0",
    shippingMethod: "Air Mail",
    discountTotal: "0",
    taxTotal: "0",
    total: "1100",
    items: [{ albumTitle: "Example", artistName: "Artist", unitPrice: "1000", quantity: 1 }]
  },
  parse_errors: [],
  authentication_verified: false,
  related_order_id: null,
  manually_cancelled_at: null
};

async function renderPage() {
  render(await OrderDetailPage({
    params: Promise.resolve({ id: "cdjapan", orderId: "92000001" }),
    searchParams: Promise.resolve({})
  }));
}

describe("pending order cancellation control", () => {
  beforeEach(() => {
    database.event = { ...confirmation };
  });

  afterEach(cleanup);

  it("shows import and whole-order cancellation for a pending order", async () => {
    await renderPage();

    expect(screen.getByRole("button", { name: "导入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认取消订单" })).toBeInTheDocument();
  });

  it("shows restoration and hides import after manual cancellation", async () => {
    database.event = { ...confirmation, manually_cancelled_at: "2026-08-09T00:00:00.000Z" };
    await renderPage();

    expect(screen.getByRole("button", { name: "确认恢复订单" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入" })).not.toBeInTheDocument();
  });
});
