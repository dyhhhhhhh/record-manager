import { describe, expect, it } from "vitest";

import { isValidCronAuthorization } from "@/features/mail/cron-auth";

describe("cron authorization", () => {
  it("accepts the exact bearer secret", () => {
    expect(isValidCronAuthorization("Bearer 1234567890abcdef", "1234567890abcdef")).toBe(true);
  });

  it("rejects missing, malformed and wrong credentials", () => {
    expect(isValidCronAuthorization(null, "1234567890abcdef")).toBe(false);
    expect(isValidCronAuthorization("1234567890abcdef", "1234567890abcdef")).toBe(false);
    expect(isValidCronAuthorization("Bearer wrong", "1234567890abcdef")).toBe(false);
  });
});
