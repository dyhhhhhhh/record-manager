import { expect, test } from "@playwright/test";

test.describe("authenticated record workflow", () => {
  test.skip(!process.env.E2E_AUTH_STORAGE, "需要已登录 Supabase owner 的 Playwright storageState");

  test("collection, inbox and order search are available", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "买过什么，一眼就知道。" })).toBeVisible();
    await expect(page.getByLabel("搜索专辑、艺人或订单")).toBeVisible();

    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "待你确认" })).toBeVisible();
    await expect(page.getByRole("button", { name: "同步 QQ 邮箱" })).toBeVisible();

    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "订单" })).toBeVisible();
    await expect(page.getByLabel("搜索订单")).toBeVisible();
  });

  test("seeded event exposes only manual confirmation actions", async ({ page }) => {
    test.skip(!process.env.E2E_EVENT_ID, "需要预置 mail_event ID");
    await page.goto(`/inbox/${process.env.E2E_EVENT_ID}`);
    await expect(page.getByText("Mail event", { exact: false })).toBeVisible();
    await expect(page.getByText(/确认|重新解析/).first()).toBeVisible();
  });

  test("seeded order exposes fulfillment, cancellation and restore controls", async ({ page }) => {
    test.skip(!process.env.E2E_ORDER_ID, "需要预置 order ID");
    await page.goto(`/orders/${process.env.E2E_ORDER_ID}`);
    await expect(page.getByText("履约状态")).toBeVisible();
    await expect(page.getByText(/取消整张订单|恢复整张订单/)).toBeVisible();
    await expect(page.getByText(/取消这张唱片|恢复这张唱片/).first()).toBeVisible();
  });
});
