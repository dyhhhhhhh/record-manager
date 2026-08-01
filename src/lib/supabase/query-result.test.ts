import { describe, expect, it } from "vitest";

import { requireSupabaseData } from "@/lib/supabase/query-result";

describe("Supabase query result handling", () => {
  it("returns successful data and surfaces database failures", () => {
    expect(requireSupabaseData({ data: ["order"], error: null }, "读取订单")).toEqual(["order"]);
    expect(() =>
      requireSupabaseData({ data: null, error: { message: "connection lost" } }, "读取订单")
    ).toThrow("读取订单：connection lost");
  });
});
