import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/lib/env";

describe("environment validation", () => {
  it("accepts the required public Supabase settings", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example"
      })
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example"
    });
  });

  it("rejects an incomplete server configuration", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example"
      })
    ).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("requires a cron secret with at least 16 characters", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
        SUPABASE_SECRET_KEY: "sb_secret_example",
        OWNER_USERNAME: "owner",
        OWNER_EMAIL: "owner@example.com",
        QQ_IMAP_EMAIL: "123456@qq.com",
        QQ_IMAP_AUTH_CODE: "auth-code",
        CRON_SECRET: "short"
      })
    ).toThrow(/CRON_SECRET/);
  });

  it("accepts and trims the configured owner username", () => {
    expect(
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
        SUPABASE_SECRET_KEY: "sb_secret_example",
        OWNER_USERNAME: "  daiyingheng  ",
        OWNER_EMAIL: "owner@example.com",
        QQ_IMAP_EMAIL: "123456@qq.com",
        QQ_IMAP_AUTH_CODE: "auth-code",
        CRON_SECRET: "a-secure-cron-secret"
      }).OWNER_USERNAME
    ).toBe("daiyingheng");
  });
});
