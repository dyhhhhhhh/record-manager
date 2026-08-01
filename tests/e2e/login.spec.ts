import { expect, test } from "@playwright/test";

test("owner can reach the password login screen", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "你的唱片订单簿" })).toBeVisible();
  await expect(page.getByLabel("账号")).toBeVisible();
  await expect(page.getByLabel("密码")).toBeVisible();
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
});
