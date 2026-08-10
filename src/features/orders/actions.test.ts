import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`unexpected redirect: ${path}`);
  }
}));
vi.mock("@/features/auth/require-owner", () => ({
  requireOwner: async () => ({ id: "owner-id" })
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc: mocks.rpc })
}));

import { setPendingOrderCancellationAction } from "@/features/orders/actions";

describe("pending order cancellation action", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends the exact pending event identity and refreshes every order view", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    await setPendingOrderCancellationAction("event-id", "cdjapan", "92000001", true);

    expect(mocks.rpc).toHaveBeenCalledWith("set_pending_order_cancellation", {
      p_event_id: "event-id",
      p_merchant: "cdjapan",
      p_external_order_id: "92000001",
      p_cancelled: true
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/"],
      ["/orders"],
      ["/orders/cdjapan/92000001"]
    ]);
  });
});
