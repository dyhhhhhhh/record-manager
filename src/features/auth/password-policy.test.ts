import { describe, expect, it } from "vitest";

import { validateOwnerPassword } from "@/features/auth/password-policy";

describe("owner password policy", () => {
  it("rejects passwords shorter than 12 characters", () => {
    expect(validateOwnerPassword("short", "short")).toEqual({ ok: false, reason: "too-short" });
  });

  it("rejects a confirmation that does not match", () => {
    expect(validateOwnerPassword("a-secure-password", "different-password")).toEqual({
      ok: false,
      reason: "mismatch"
    });
  });

  it("accepts a matching password with at least 12 characters", () => {
    expect(validateOwnerPassword("a-secure-password", "a-secure-password")).toEqual({ ok: true });
  });
});
