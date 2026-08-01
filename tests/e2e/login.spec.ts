import { expect, test } from "@playwright/test";

test("owner can reach the email OTP login screen", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "你的唱片订单簿" })).toBeVisible();
  await expect(page.getByLabel("邮箱地址")).toBeVisible();
  await expect(page.getByRole("button", { name: "获取登录链接" })).toBeVisible();
});
