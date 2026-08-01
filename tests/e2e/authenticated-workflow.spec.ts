import { expect, test } from "@playwright/test";

test.describe("authenticated record workflow", () => {
  test.skip(!process.env.E2E_AUTH_STORAGE, "需要已登录 Supabase owner 的 Playwright storageState");

  test("collection and the unified order page are available", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "买过什么，一眼就知道。" })).toBeVisible();
    await expect(page.getByLabel("搜索专辑、艺人或订单")).toBeVisible();

    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole("heading", { name: "订单" })).toBeVisible();
    await expect(page.getByLabel("搜索订单")).toBeVisible();
    await expect(page.getByRole("button", { name: "同步新邮件" })).toBeVisible();
  });

  test("a legacy event URL opens the unified order detail", async ({ page }) => {
    test.skip(!process.env.E2E_EVENT_ID, "需要预置 mail_event ID");
    await page.goto(`/inbox/${process.env.E2E_EVENT_ID}`);
    await expect(page).toHaveURL(/\/orders\//);
    await expect(page.getByText("订单邮件记录")).toBeVisible();
    await expect(page.getByText("订单基础信息")).toBeVisible();
  });

  test("seeded order exposes fulfillment, cancellation and restore controls", async ({ page }) => {
    test.skip(!process.env.E2E_ORDER_EXTERNAL_ID, "需要预置 iMusic 外部订单 ID");
    await page.goto(`/orders/${process.env.E2E_ORDER_EXTERNAL_ID}`);
    await expect(page.getByText("履约状态")).toBeVisible();
    await expect(page.getByText("税费（已包含）")).toBeVisible();
    await expect(page.getByText(/取消整张订单|恢复整张订单/)).toBeVisible();
    await expect(page.getByText(/取消这张唱片|恢复这张唱片/).first()).toBeVisible();
  });

  test("mobile collection, orders and detail stay within the viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "仅在 390 × 844 手机视口验证");

    for (const url of ["/", "/orders"]) {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }

    await expect(page.locator("select")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "订单状态" })).toBeVisible();
    const mobileNavLinks = page.getByRole("navigation", { name: "主要导航" }).getByRole("link");
    await expect(mobileNavLinks).toHaveCount(2);
    for (const link of await mobileNavLinks.all()) {
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(48);
    }

    if (process.env.E2E_ORDER_EXTERNAL_ID) {
      await page.goto(`/orders/${process.env.E2E_ORDER_EXTERNAL_ID}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await expect(page.locator("select")).toHaveCount(0);
      await expect(page.getByRole("combobox", { name: "履约状态" })).toBeVisible();
    }
  });
});
