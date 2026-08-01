import { describe, expect, it } from "vitest";

import { isOwnerEmail, isOwnerUsername } from "@/features/auth/owner";

describe("owner email guard", () => {
  it("matches the configured address without case sensitivity", () => {
    expect(isOwnerEmail(" Owner@Example.com ", "owner@example.com")).toBe(true);
  });

  it("rejects every other email address", () => {
    expect(isOwnerEmail("visitor@example.com", "owner@example.com")).toBe(false);
  });
});

describe("owner username guard", () => {
  it("matches the configured username without case sensitivity", () => {
    expect(isOwnerUsername(" DaiYingHeng ", "daiyingheng")).toBe(true);
  });

  it("rejects every other username", () => {
    expect(isOwnerUsername("visitor", "daiyingheng")).toBe(false);
  });
});
