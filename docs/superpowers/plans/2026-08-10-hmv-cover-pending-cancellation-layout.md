# HMV Cover and Pending Cancellation Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解析 HMV 新确认邮件中的 7 张官方封面，并让待导入订单的取消卡片紧邻右侧订单基础信息。

**Architecture:** HMV 解析器继续以纯文本作为订单与金额真值，只从严格白名单内的 HTML 链接补充封面和商品 URL。待导入详情页把右侧导入表单与取消表单放入同一个 `aside`，左侧商品输入通过标准 HTML `form` 属性加入右侧导入表单，避免嵌套表单。

**Tech Stack:** Next.js 16、React 19 Server Actions、TypeScript、Cheerio、Mailparser、Vitest、Testing Library、Supabase、Vercel。

## Global Constraints

- 不抓取 HMV 官网商品页，只读取邮件正文。
- 仅接受 HTTPS、精确 HMV 官方主机与已验证的图片/商品路径。
- HMV 文本订单解析失败时仍按现有规则报错；HTML 元数据缺失或歧义时使用占位图，不阻断订单。
- 不改变其他商家、金额公式、商品数量或订单状态逻辑。
- 所有生产代码必须先有已观察到正确失败原因的回归测试。
- 项目规则禁止创建或委派子代理，因此本计划只能由当前主代理使用 `superpowers:executing-plans` 内联执行。
- 每次提交前审查全部待提交差异并修复所有可执行问题。

---

### Task 1: HMV 新确认邮件封面与商品链接

**Files:**
- Modify: `src/features/covers/trusted-cover-url.test.ts`
- Modify: `src/features/covers/trusted-cover-url.ts`
- Modify: `src/features/mail/hmv-parser.test.ts`
- Modify: `src/features/mail/hmv-parser.ts`

**Interfaces:**
- Consumes: `canonicalizeHmvCoverUrl(value: string): string | null`、`canonicalizeHmvProductUrl(value: string): string | null`、`parseHmvMessage(source: Buffer | string): Promise<MailEventPayload | null>`。
- Produces: 同一签名；封面规范化新增 `/image/jacket/(数字路径)/(数字).jpg`，商品链接规范化新增 `/en/product/detail/{id}`，HMV 确认载荷的商品可包含 `imageUrl` 与 `productUrl`。

- [ ] **Step 1: 写 URL 白名单失败测试**

在 `trusted-cover-url.test.ts` 的 HMV 用例中加入手工推导的精确预期：

```ts
expect(canonicalizeHmvCoverUrl(
  "https://img.hmv.co.jp/image/jacket/190/00/0/0/19000001.jpg?utm_source=mail#cover"
)).toBe("https://img.hmv.co.jp/image/jacket/190/00/0/0/19000001.jpg");
expect(canonicalizeHmvProductUrl(
  "https://www.hmv.co.jp/en/product/detail/19000001?utm_source=mail"
)).toBe("https://www.hmv.co.jp/en/product/detail/19000001");
expect(isTrustedCoverUrl(
  "https://img.hmv.co.jp/image/jacket/190/00/0/0/19000001.jpg",
  "hmv"
)).toBe(true);
```

拒绝列表新增：

```ts
"http://img.hmv.co.jp/image/jacket/190/00/0/0/19000001.jpg"
"https://user@img.hmv.co.jp/image/jacket/190/00/0/0/19000001.jpg"
"https://img.hmv.co.jp.attacker.example/image/jacket/190/00/0/0/19000001.jpg"
"https://img.hmv.co.jp/image/jacket/190/00/0/0/19000001.png"
"https://www.hmv.co.jp/en/product/detail/19000001/extra"
"https://www.hmv.co.jp.attacker.example/en/product/detail/19000001"
```

- [ ] **Step 2: 运行 URL 测试并观察 RED**

Run: `PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test src/features/covers/trusted-cover-url.test.ts`

Expected: 新封面与 `/en/product/detail/` 断言收到 `null`，证明测试捕获当前白名单缺口。

- [ ] **Step 3: 写 HMV 确认邮件失败测试**

在 `hmv-parser.test.ts` 增加一个生成脱敏 multipart 邮件的测试辅助函数。纯文本复用现有确认邮件正文；HTML 用以下 8 组标题与合成商品 ID 生成成对的图片链接和文本链接：

```ts
const COVERED_CONFIRMATION_ITEMS = [
  ["Synthetic Waves〜Vinyl Edition〜(2nd Press)", "19000001"],
  ["Synthetic Sunlight (repress)", "19000002"],
  ["Synthetic Session", "19000003"],
  ["Synthetic Archive Human", "19000004"],
  ["Synthetic Planet", "19000005"],
  ["Synthetic Space Return", "19000006"],
  ["SYNTHETIC ARCHIVE O.S.T.+", "19000007"],
  ["Synthetic Archive O.s.t.2", "19000008"]
] as const;

const html = COVERED_CONFIRMATION_ITEMS.map(([title, id]) => `
  <a href="https://www.hmv.co.jp/en/product/detail/${id}">
    <img src="https://img.hmv.co.jp/image/jacket/190/00/0/0/${id}.jpg" alt="${title}">
  </a>
  <a href="https://www.hmv.co.jp/en/product/detail/${id}">${title}</a>
`).join("");
```

断言订单确认载荷 8 个商品均得到可信元数据：

```ts
expect(result?.type).toBe("order_confirmation");
if (result?.type === "order_confirmation") {
  expect(result.items).toHaveLength(8);
  expect(result.items.every((item) => item.imageUrl && item.productUrl)).toBe(true);
  expect(result.items[0]).toMatchObject({
    imageUrl: "https://img.hmv.co.jp/image/jacket/190/00/0/0/19000001.jpg",
    productUrl: "https://www.hmv.co.jp/en/product/detail/19000001"
  });
}
```

- [ ] **Step 4: 运行解析测试并观察 RED**

Run: `PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test src/features/mail/hmv-parser.test.ts`

Expected: “全部商品同时具有 `imageUrl` 和 `productUrl`”的布尔断言为 `false`，因为当前确认分支返回 `parsedItems`，且新 URL 被白名单拒绝。

- [ ] **Step 5: 最小实现新 URL 规则**

在 `trusted-cover-url.ts` 中保留旧 `/img.asp` 分支，并加入精确新路径：

```ts
const jacketPath = url.pathname.match(/^\/image\/jacket\/(?:\d+\/){4}\d+\.jpg$/i);
if (
  url.protocol === "https:"
  && url.hostname === "img.hmv.co.jp"
  && !url.username
  && !url.password
  && jacketPath
) return `https://img.hmv.co.jp${url.pathname}`;
```

商品路径改为：

```ts
const match = url.pathname.match(/^\/(en\/)?product\/detail\/(\d+)\/?$/i);
if (url.protocol !== "https:" || url.hostname !== "www.hmv.co.jp" || url.username || url.password || !match) return null;
const locale = match[1] ? "/en" : "";
return `https://www.hmv.co.jp${locale}/product/detail/${match[2]}`;
```

- [ ] **Step 6: 最小实现确认邮件 HTML 合并**

在 `hmv-parser.ts` 中：

1. `htmlItemMetadata` 从当前商品链接内先读取直属可信封面，再回退到旧的 `coversBySku`。
2. 第二个文本链接沿用同一商品此前找到的 `imageUrl`，不能覆盖为 `undefined`。
3. 在订单确认分支之前统一执行：

```ts
const items = typeof message.html === "string"
  ? attachHtmlMetadata(parsedItems, message.html)
  : parsedItems;
```

4. 确认、发货和取消载荷都使用 `items`。

- [ ] **Step 7: 运行 HMV 与 URL 测试并观察 GREEN**

Run: `PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test src/features/covers/trusted-cover-url.test.ts src/features/mail/hmv-parser.test.ts src/features/mail/order-mail-parser.test.ts`

Expected: 全部 PASS，旧 HMV 模板和恶意 URL 回归不变。

- [ ] **Step 8: 审查并提交 HMV 修复**

```bash
git diff --check
git diff -- src/features/covers/trusted-cover-url.ts src/features/covers/trusted-cover-url.test.ts src/features/mail/hmv-parser.ts src/features/mail/hmv-parser.test.ts
git add src/features/covers/trusted-cover-url.ts src/features/covers/trusted-cover-url.test.ts src/features/mail/hmv-parser.ts src/features/mail/hmv-parser.test.ts
git diff --cached --check
git commit -m "fix: parse hmv confirmation covers"
```

### Task 2: 待导入订单右侧取消卡片

**Files:**
- Modify: `src/app/(app)/orders/[id]/[orderId]/page.test.tsx`
- Modify: `src/app/(app)/orders/[id]/[orderId]/page.tsx`

**Interfaces:**
- Consumes: `OrderCancellationForm`、`importOrderFromDetailAction`、标准 HTML `form` 属性。
- Produces: `Field` 新增可选 `form?: string`；待导入详情页的导入表单 ID 固定为 `pending-order-import-form`，取消表单位于同一 `aside` 内。

- [ ] **Step 1: 写右侧栏布局失败测试**

在页面测试中导入 `within`，把仅检查按钮存在改为检查真实可访问层级：

```tsx
const sidebar = screen.getByRole("complementary");
expect(within(sidebar).getByRole("button", { name: "导入" })).toBeInTheDocument();
expect(within(sidebar).getByRole("button", { name: "确认取消订单" })).toBeInTheDocument();
```

该测试捕获的生产变更是：取消表单再次成为外层网格独立行时，测试必须失败。

- [ ] **Step 2: 运行页面测试并观察 RED**

Run: `PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test 'src/app/(app)/orders/[id]/[orderId]/page.test.tsx'`

Expected: `complementary` 内找不到“确认取消订单”，但页面全局仍存在该按钮。

- [ ] **Step 3: 最小重构待导入表单归属**

在 `Field` 中新增 `form?: string` 并传给 `<input form={form}>`：

```tsx
function Field({ label, name, defaultValue, type = "text", required = true, form }: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  required?: boolean;
  form?: string;
}) {
  return (
    <label className="block text-xs font-semibold">
      {label}
      <input
        className="mt-1 h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm"
        defaultValue={defaultValue}
        form={form}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}
```

待导入分支使用以下明确归属：

```tsx
const pendingImportFormId = "pending-order-import-form";

<div className="mt-8 grid gap-5 xl:grid-cols-[1fr_340px]">
  <div className="space-y-5">
    {unified.payload.items.map((item, index) => (
      <fieldset
        className="grid gap-5 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:grid-cols-[120px_1fr]"
        disabled={!unified.canImport}
        key={`${item.albumTitle}-${index}`}
      >
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-black/5">
          <CoverImage
            alt={`${item.artistName}《${item.albumTitle}》封面`}
            sizes="120px"
            src={item.imageUrl && isTrustedCoverUrl(item.imageUrl, merchant) ? item.imageUrl : null}
          />
        </div>
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold sm:col-span-2">
            专辑
            <input defaultValue={item.albumTitle} form={pendingImportFormId} name={`albumTitle.${index}`} required />
          </label>
          <label className="text-xs font-semibold sm:col-span-2">
            艺人
            <input defaultValue={item.artistName} form={pendingImportFormId} name={`artistName.${index}`} required />
          </label>
          <Field form={pendingImportFormId} label="单价" name={`unitPrice.${index}`} defaultValue={item.unitPrice} />
          <Field form={pendingImportFormId} label="数量" name={`quantity.${index}`} defaultValue={item.quantity} type="number" />
          <label className="text-xs font-semibold sm:col-span-2">
            图片地址
            <input defaultValue={item.imageUrl ?? ""} form={pendingImportFormId} name={`imageUrl.${index}`} />
          </label>
          <input form={pendingImportFormId} name={`productUrl.${index}`} type="hidden" value={item.productUrl ?? ""} />
          <input form={pendingImportFormId} name={`merchantItemId.${index}`} type="hidden" value={item.merchantItemId ?? ""} />
        </div>
      </fieldset>
    ))}
  </div>
  <aside className="space-y-5">
    <form
      action={importOrderFromDetailAction.bind(null, unified.confirmationEventId ?? "", merchant, externalOrderId)}
      id={pendingImportFormId}
    >
      <fieldset className="contents" disabled={!unified.canImport}>
        <input name="itemCount" type="hidden" value={unified.payload.items.length} />
        <div className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">订单基础信息</h2>
            {unified.canImport && unified.confirmationEventId ? <ImportOrderButton compact /> : null}
          </div>
          <Field label="订单 ID" name="externalOrderId" defaultValue={unified.payload.externalOrderId} />
          <Field label="下单时间" name="orderedAt" type="datetime-local" defaultValue={toShanghaiDateTimeInput(unified.payload.occurredAt)} />
          <Field label="币种" name="currency" defaultValue={unified.payload.currency} />
          <Field label="唱片费用" name="itemsSubtotal" defaultValue={unified.payload.itemsSubtotal} />
          <Field label="邮费" name="shippingTotal" defaultValue={unified.payload.shippingTotal} />
          <Field label="附加费" name="additionalFeeTotal" defaultValue={unified.payload.additionalFeeTotal} />
          <Field label="配送方式" name="shippingMethod" defaultValue={unified.payload.shippingMethod} />
          <Field label="优惠" name="discountTotal" defaultValue={unified.payload.discountTotal} />
          <Field label="税费（已包含）" name="taxTotal" defaultValue={unified.payload.taxTotal} />
          <Field label="订单总额" name="total" defaultValue={unified.payload.total} />
        </div>
      </fieldset>
    </form>
    {unified.pendingCancellationEventId ? (
      <OrderCancellationForm
        action={setPendingOrderCancellationAction.bind(
          null,
          unified.pendingCancellationEventId,
          merchant,
          externalOrderId,
          !unified.manuallyCancelled
        )}
        cancelled={unified.manuallyCancelled}
      />
    ) : null}
  </aside>
</div>
```

保留现有类名、文案、禁用状态和 Server Action 参数，不新增列表页按钮。

- [ ] **Step 4: 运行页面与表单测试并观察 GREEN**

Run: `PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test 'src/app/(app)/orders/[id]/[orderId]/page.test.tsx' src/features/orders/import-form.test.ts src/features/orders/actions.test.ts src/components/order-cancellation-form.test.tsx`

Expected: 全部 PASS，取消与恢复状态均保留。

- [ ] **Step 5: 审查并提交布局修复**

```bash
git diff --check
git diff -- 'src/app/(app)/orders/[id]/[orderId]/page.tsx' 'src/app/(app)/orders/[id]/[orderId]/page.test.tsx'
git add 'src/app/(app)/orders/[id]/[orderId]/page.tsx' 'src/app/(app)/orders/[id]/[orderId]/page.test.tsx'
git diff --cached --check
git commit -m "fix: keep pending cancellation in sidebar"
```

### Task 3: 完整验证、部署与数据回填

**Files:**
- Verify only: all changed production and test files from Tasks 1-2
- No database migration required

**Interfaces:**
- Consumes: 已提交的 HMV 解析器与详情页布局。
- Produces: Vercel `Ready` 生产部署、更新后的 HMV `mail_events.parsed_payload`、恢复原状的 CDJapan 测试订单。

- [ ] **Step 1: 运行完整本地验证**

```bash
PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm test
PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm lint
PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm typecheck
PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm build
```

Expected: 0 个失败、0 个 lint/type/build 错误。

- [ ] **Step 2: 审查全部实现提交与工作区**

```bash
git status --short --branch
git diff --check 187ba41..HEAD
git log --oneline 187ba41..HEAD
git show --check --stat HEAD
```

确认没有原始邮件、凭据、真实姓名/地址或无关文件进入提交。

- [ ] **Step 3: 部署 Vercel 并确认 Ready**

```bash
set -a
source .env.local
set +a
PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm dlx vercel@latest --prod --yes
```

记录部署 URL，并运行 `PATH=/Users/dyh/.nvm/versions/node/v22.22.0/bin:$PATH pnpm dlx vercel@latest inspect record-manager-three.vercel.app`，确认生产状态为 `Ready`。

- [ ] **Step 4: 重新执行一年全量同步**

使用 `runOwnerMailSync(owner.user_id, "full")`，Supabase 管理客户端只从 `.env.local` 读取，不输出密钥。

Expected: `status: "succeeded"` 且 `failedCount: 0`。

- [ ] **Step 5: 只读验证 HMV 数据**

查询 2026-08-08 的 HMV `order_confirmation` 事件并仅输出脱敏统计：

```ts
{
  itemCount: 7,
  coverCount: 7,
  productUrlCount: 7,
  untrustedCoverCount: 0,
  parseErrors: []
}
```

- [ ] **Step 6: 生产页面回归**

从 `/orders?q=10115229066` 点击“详情”，验证：

- `确认取消订单` 位于 `complementary` 右侧栏内，紧邻基础信息；
- 取消后状态为“已取消”、导入按钮消失、恢复按钮出现；
- 恢复后状态回到“待导入”，数据库 `manually_cancelled_at` 为 `null`；
- HMV 目标订单详情展示 7 张官方可信封面。

- [ ] **Step 7: 保持分支等待用户决定集成方式**

不自动推送或合并。报告生产 URL、验证统计、提交列表和当前分支状态。
