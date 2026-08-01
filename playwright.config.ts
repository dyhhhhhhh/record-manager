import { defineConfig, devices } from "@playwright/test";

const remoteBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: remoteBaseUrl ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    storageState: process.env.E2E_AUTH_STORAGE || undefined
  },
  webServer: remoteBaseUrl ? undefined : {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      SUPABASE_SECRET_KEY: "sb_secret_example",
      OWNER_USERNAME: "owner",
      OWNER_EMAIL: "owner@example.com",
      QQ_IMAP_EMAIL: "123456@qq.com",
      QQ_IMAP_AUTH_CODE: "example-auth-code",
      CRON_SECRET: "1234567890abcdef"
    }
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
