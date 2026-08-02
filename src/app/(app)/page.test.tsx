import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const orders = [{
  id: "order-1",
  merchant: "imusic",
  external_order_id: "90000001",
  ordered_at: "2026-07-29T03:27:10.000Z",
  currency: "CNY",
  effective_total: "120.00",
  shipping_total: "20.00",
  tax_total: "0.00",
  fulfillment_status: "ordered",
  cancelled_at: null,
  order_items: [{
    id: "item-1",
    album_title: "Example Album",
    artist_name: "Example Artist",
    unit_price: "100.00",
    quantity: 1,
    image_path: null,
    cancelled_at: null
  }]
}];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        order: async () => ({ data: orders, error: null })
      })
    }),
    storage: {
      from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) })
    }
  })
}));

vi.mock("@/components/collection-summary", () => ({ CollectionSummary: () => <div /> }));

import HomePage from "@/app/(app)/page";

describe("collection page merchant presentation", () => {
  it("uses an accessible icon instead of a visible merchant name on record cards", async () => {
    render(await HomePage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Example Album")).toBeInTheDocument();
    expect(screen.queryByText("iMusic")).not.toBeInTheDocument();
    expect(screen.getByLabelText("iMusic")).toBeInTheDocument();
  });
});
