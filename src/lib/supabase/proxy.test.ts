import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { applySessionCookies } from "@/lib/supabase/proxy";

describe("Supabase session proxy", () => {
  it("copies refreshed cookies to the request and response with no-cache headers", () => {
    const request = new NextRequest("https://records.example.com/orders");
    const response = applySessionCookies(
      request,
      [{ name: "sb-auth", value: "refreshed", options: { httpOnly: true, path: "/" } }],
      { "Cache-Control": "private, no-store", Expires: "0" }
    );

    expect(request.cookies.get("sb-auth")?.value).toBe("refreshed");
    expect(response.cookies.get("sb-auth")?.value).toBe("refreshed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("expires")).toBe("0");
  });
});
