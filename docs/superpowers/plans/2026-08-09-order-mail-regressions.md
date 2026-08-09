# Order Mail Regression Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let pending imports be manually cancelled and restored from the same order-detail control used by stored orders, while recovering the real iMusic and HMV Japan confirmation messages missed on 2026-08-08.

**Architecture:** Persist manual cancellation on the pending confirmation event without changing its mail-processing status, derive the unified order state from that field, and protect imports with a transactional database trigger. Keep merchant parser changes isolated: iMusic reads an optional quantity multiplier from the price cell, while HMV adds one exact confirmation subject to both IMAP search and header classification.

**Tech Stack:** Next.js 16 App Router, React 19 server actions, TypeScript, Vitest/Testing Library, Supabase PostgreSQL/RPC/RLS, ImapFlow, MailParser, Cheerio, Vercel.

## Global Constraints

- 使用中文回答。
- 不得创建、调用或委派任何子代理；本计划必须由当前主代理通过 `superpowers:executing-plans` 执行。
- 每次提交前必须审查全部待提交更改；发现问题时先修复并重新审查，直到没有可执行问题后才能提交。
- 手动取消不得把真实邮件标记为 `ignored`，也不得伪造取消邮件。
- 已收到真实取消邮件的待导入订单不可通过手动恢复重新导入。
- HMV 只增加精确主题，不扩大到模糊主题匹配。
- 不修改其他商家的邮件模板规则。

---

## File Structure

- Create `supabase/migrations/202608090001_pending_order_cancellation.sql`: add pending-event cancellation persistence, RPC validation, and the transactional import guard.
- Create `src/components/order-cancellation-form.tsx`: shared visual control for stored and pending orders.
- Create `src/components/order-cancellation-form.test.tsx`: verify cancel/restore copy and accessible controls.
- Create `src/app/(app)/orders/[id]/[orderId]/page.test.tsx`: verify pending detail integration and import-button visibility.
- Modify `src/features/orders/unified-orders.ts`: expose and derive manual pending cancellation state.
- Modify `src/features/orders/unified-orders.test.ts`: cover cancellation, restoration, and real cancellation precedence.
- Modify `src/features/orders/actions.ts`: call the constrained pending-cancellation RPC.
- Modify `src/features/orders/import-actions.ts`: reject manually cancelled events before list imports; the database trigger protects every import path.
- Modify `src/app/(app)/orders/page.tsx` and `src/app/(app)/orders/[id]/[orderId]/page.tsx`: select the new field and render the shared cancellation control.
- Modify `src/lib/database/migration.test.ts`: assert migration safety, permissions, and import guard.
- Modify `src/features/mail/imusic-parser.ts` and `src/features/mail/imusic-parser.test.ts`: parse quantity multipliers.
- Modify `src/features/mail/hmv-parser.ts`, `src/features/mail/hmv-parser.test.ts`, `src/features/mail/imap-gateway.ts`, and `src/features/mail/imap-gateway.test.ts`: recognize and search the exact new HMV subject.

### Task 1: Pending-order cancellation persistence and unified state

**Files:**
- Create: `supabase/migrations/202608090001_pending_order_cancellation.sql`
- Modify: `src/lib/database/migration.test.ts`
- Modify: `src/features/orders/unified-orders.ts`
- Modify: `src/features/orders/unified-orders.test.ts`

**Interfaces:**
- Produces: `mail_events.manually_cancelled_at timestamptz`.
- Produces: `public.set_pending_order_cancellation(uuid, text, text, boolean) returns void`.
- Produces: `UnifiedMailEvent.manually_cancelled_at: string | null`.
- Produces: `UnifiedOrderRow.manuallyCancelled: boolean` and `pendingCancellationEventId: string | null`.

- [ ] **Step 1: Add failing unified-state tests**

Add `manually_cancelled_at: null` to the shared event fixture, then add these cases to `src/features/orders/unified-orders.test.ts`:

```ts
it("treats a manually cancelled pending confirmation as cancelled but keeps its preview", () => {
  const confirmation = {
    ...event("confirmation", "order_confirmation"),
    manually_cancelled_at: "2026-08-09T00:00:00.000Z"
  };

  expect(buildUnifiedOrderRows([confirmation], [])[0]).toMatchObject({
    state: "cancelled",
    canImport: false,
    manuallyCancelled: true,
    pendingCancellationEventId: "confirmation",
    payload: confirmationPayload
  });
});

it("restores pending import behavior when manual cancellation is cleared", () => {
  expect(buildUnifiedOrderRows([event("confirmation", "order_confirmation")], [])[0]).toMatchObject({
    state: "pending_import",
    canImport: true,
    manuallyCancelled: false,
    pendingCancellationEventId: "confirmation"
  });
});

it("does not offer manual restoration when a parsed cancellation mail exists", () => {
  const rows = buildUnifiedOrderRows([
    event("confirmation", "order_confirmation"),
    event("cancel", "cancellation")
  ], []);

  expect(rows[0]).toMatchObject({
    state: "cancelled",
    canImport: false,
    manuallyCancelled: false,
    pendingCancellationEventId: null
  });
});
```

- [ ] **Step 2: Add the failing migration contract test**

Add the new migration path and a test to `src/lib/database/migration.test.ts`:

```ts
const pendingCancellationPath = join(process.cwd(), "supabase/migrations/202608090001_pending_order_cancellation.sql");

it("adds reversible pending-order cancellation with a transactional import guard", () => {
  const sql = readFileSync(pendingCancellationPath, "utf8");
  expect(sql).toContain("manually_cancelled_at timestamptz");
  expect(sql).toContain("public.set_pending_order_cancellation");
  expect(sql).toContain("event_type = 'order_confirmation'");
  expect(sql).toContain("related_order_id is null");
  expect(sql).toContain("for update");
  expect(sql).toContain("mail cancellation cannot be restored");
  expect(sql).toContain("manually cancelled orders cannot be imported");
  expect(sql).toContain("revoke all on function public.set_pending_order_cancellation");
  expect(sql).toContain("grant execute on function public.set_pending_order_cancellation");
});
```

- [ ] **Step 3: Run the two focused tests and verify RED**

Run:

```bash
pnpm test src/features/orders/unified-orders.test.ts src/lib/database/migration.test.ts
```

Expected: FAIL because the unified properties and migration file do not exist.

- [ ] **Step 4: Add the database migration**

Create `supabase/migrations/202608090001_pending_order_cancellation.sql` with this behavior:

```sql
alter table public.mail_events
  add column if not exists manually_cancelled_at timestamptz;

create or replace function public.set_pending_order_cancellation(
  p_event_id uuid,
  p_merchant text,
  p_external_order_id text,
  p_cancelled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid := auth.uid();
  event_row public.mail_events%rowtype;
begin
  if owner_id is null or not public.is_app_owner() then
    raise exception 'not allowed';
  end if;

  select * into event_row
  from public.mail_events
  where id = p_event_id
    and user_id = owner_id
    and merchant = p_merchant
    and external_order_id = p_external_order_id
    and event_type = 'order_confirmation'
    and status = 'pending'
    and related_order_id is null
  for update;

  if not found then
    raise exception 'pending order event not found';
  end if;

  if not p_cancelled and exists (
    select 1
    from public.mail_events cancellation
    where cancellation.user_id = owner_id
      and cancellation.merchant = event_row.merchant
      and cancellation.external_order_id = event_row.external_order_id
      and cancellation.event_type = 'cancellation'
      and (
        cancellation.status = 'applied'
        or (cancellation.status = 'pending' and cancellation.authentication_verified)
      )
  ) then
    raise exception 'mail cancellation cannot be restored';
  end if;

  update public.mail_events
  set manually_cancelled_at = case
    when p_cancelled then coalesce(manually_cancelled_at, now())
    else null
  end
  where id = event_row.id;
end;
$$;

create or replace function public.prevent_manually_cancelled_order_import()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.event_type = 'order_confirmation'
    and old.manually_cancelled_at is not null
    and new.status = 'applied'
    and new.related_order_id is not null then
    raise exception 'manually cancelled orders cannot be imported';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_manually_cancelled_order_import on public.mail_events;
create trigger prevent_manually_cancelled_order_import
before update of status, related_order_id on public.mail_events
for each row execute function public.prevent_manually_cancelled_order_import();

revoke all on function public.set_pending_order_cancellation(uuid, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_pending_order_cancellation(uuid, text, text, boolean) to authenticated;
revoke all on function public.prevent_manually_cancelled_order_import() from public, anon, authenticated, service_role;
```

- [ ] **Step 5: Implement unified-state derivation**

In `src/features/orders/unified-orders.ts`, add the database field immediately after `related_order_id` and add the two derived fields immediately after `canImport`:

```ts
manually_cancelled_at: string | null;

manuallyCancelled: boolean;
pendingCancellationEventId: string | null;
```

After selecting the confirmation and computing `hasParsedCancellation`, derive:

```ts
const manuallyCancelled = Boolean(confirmation?.event.manually_cancelled_at);
const pendingCancellationEventId = !order && confirmation && !hasParsedCancellation
  ? confirmation.event.id
  : null;
```

For rows without a stored order, evaluate `hasCancellation || manuallyCancelled` before shipment state. Set `canImport` to the existing expression plus `&& !manuallyCancelled`, then return the two new fields.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm test src/features/orders/unified-orders.test.ts src/lib/database/migration.test.ts
```

Expected: both files PASS.

- [ ] **Step 7: Review all pending changes and commit**

Run `git diff --check`, inspect the complete `git diff`, check for secrets, fix every actionable issue, rerun the focused tests, then commit:

```bash
git add supabase/migrations/202608090001_pending_order_cancellation.sql src/lib/database/migration.test.ts src/features/orders/unified-orders.ts src/features/orders/unified-orders.test.ts
git diff --cached --check
git diff --cached
git commit -m "feat: persist pending order cancellations"
```

### Task 2: Pending-order cancellation action and detail control

**Files:**
- Create: `src/components/order-cancellation-form.tsx`
- Create: `src/components/order-cancellation-form.test.tsx`
- Create: `src/app/(app)/orders/[id]/[orderId]/page.test.tsx`
- Modify: `src/features/orders/actions.ts`
- Modify: `src/features/orders/import-actions.ts`
- Modify: `src/app/(app)/orders/page.tsx`
- Modify: `src/app/(app)/orders/[id]/[orderId]/page.tsx`

**Interfaces:**
- Consumes: `UnifiedOrderRow.manuallyCancelled` and `pendingCancellationEventId` from Task 1.
- Consumes: `public.set_pending_order_cancellation(uuid, text, text, boolean)` from Task 1.
- Produces: `setPendingOrderCancellationAction(eventId, merchant, externalOrderId, cancelled)`.
- Produces: `OrderCancellationForm({ action, cancelled })`.

- [ ] **Step 1: Add failing cancellation-control tests**

Create `src/components/order-cancellation-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderCancellationForm } from "@/components/order-cancellation-form";

describe("order cancellation form", () => {
  it("renders the standard whole-order cancellation control", () => {
    render(<OrderCancellationForm action={vi.fn()} cancelled={false} />);
    expect(screen.getByRole("heading", { name: "取消整张订单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认取消订单" })).toBeInTheDocument();
  });

  it("switches to the restoration control for a cancelled order", () => {
    render(<OrderCancellationForm action={vi.fn()} cancelled />);
    expect(screen.getByRole("heading", { name: "恢复整张订单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认恢复订单" })).toBeInTheDocument();
  });
});
```

Create `src/app/(app)/orders/[id]/[orderId]/page.test.tsx` with a mocked pending confirmation event:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  event: {} as Record<string, unknown>
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not found"); }
}));
vi.mock("@/components/cover-image", () => ({ CoverImage: () => <div /> }));
vi.mock("@/features/orders/actions", () => ({
  setFulfillmentAction: vi.fn(),
  setItemCancellationAction: vi.fn(),
  setOrderCancellationAction: vi.fn(),
  setPendingOrderCancellationAction: vi.fn(),
  updateOrderAction: vi.fn(),
  updateOrderItemAction: vi.fn(),
  uploadItemCoverAction: vi.fn()
}));
vi.mock("@/features/orders/import-actions", () => ({
  importOrderFromDetailAction: vi.fn()
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(table: string) {
      const query = {
        eq: () => query,
        order: async () => ({
          data: table === "mail_events" ? [database.event] : [],
          error: null
        }),
        maybeSingle: async () => ({
          data: table === "orders" ? null : database.event,
          error: null
        })
      };
      return { select: () => query };
    },
    storage: {
      from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) })
    }
  })
}));

import OrderDetailPage from "@/app/(app)/orders/[id]/[orderId]/page";

const confirmation = {
  id: "confirmation-event",
  merchant: "cdjapan",
  event_type: "order_confirmation",
  status: "pending",
  external_order_id: "92000001",
  subject: "Order Confirmation #92000001",
  received_at: "2026-08-08T00:00:00.000Z",
  parsed_payload: {
    merchant: "cdjapan",
    type: "order_confirmation",
    externalOrderId: "92000001",
    occurredAt: "2026-08-08T00:00:00.000Z",
    currency: "JPY",
    itemsSubtotal: "1000",
    shippingTotal: "100",
    additionalFeeTotal: "0",
    shippingMethod: "Air Mail",
    discountTotal: "0",
    taxTotal: "0",
    total: "1100",
    items: [{ albumTitle: "Example", artistName: "Artist", unitPrice: "1000", quantity: 1 }]
  },
  parse_errors: [],
  authentication_verified: false,
  related_order_id: null,
  manually_cancelled_at: null
};

async function renderPage() {
  render(await OrderDetailPage({
    params: Promise.resolve({ id: "cdjapan", orderId: "92000001" }),
    searchParams: Promise.resolve({})
  }));
}

describe("pending order cancellation control", () => {
  beforeEach(() => { database.event = { ...confirmation }; });
  afterEach(cleanup);

  it("shows import and whole-order cancellation for a pending order", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "导入" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认取消订单" })).toBeInTheDocument();
  });

  it("shows restoration and hides import after manual cancellation", async () => {
    database.event = { ...confirmation, manually_cancelled_at: "2026-08-09T00:00:00.000Z" };
    await renderPage();
    expect(screen.getByRole("button", { name: "确认恢复订单" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导入" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the UI tests and verify RED**

Run:

```bash
pnpm test src/components/order-cancellation-form.test.tsx 'src/app/(app)/orders/[id]/[orderId]/page.test.tsx'
```

Expected: FAIL because the shared form and pending detail integration do not exist.

- [ ] **Step 3: Implement the shared cancellation form**

Create `OrderCancellationForm` with the exact existing red cancellation-card markup:

```tsx
type OrderCancellationFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  cancelled: boolean;
  className?: string;
};

export function OrderCancellationForm({ action, cancelled, className = "" }: OrderCancellationFormProps) {
  return (
    <form action={action} className={`rounded-3xl border border-red-200 bg-red-50 p-5 ${className}`}>
      <h2 className="font-semibold text-red-900">{cancelled ? "恢复整张订单" : "取消整张订单"}</h2>
      <p className="mt-2 text-sm leading-6 text-red-800">
        {cancelled
          ? "恢复后，有效唱片会重新出现在首页并计入统计，履约状态保持不变。"
          : "订单内所有唱片会从首页隐藏，并从消费统计中排除。"}
      </p>
      <button className={`mt-4 h-10 w-full rounded-lg text-sm font-semibold text-white ${cancelled ? "bg-emerald-700" : "bg-red-700"}`}>
        {cancelled ? "确认恢复订单" : "确认取消订单"}
      </button>
    </form>
  );
}
```

This retains the exact existing heading, explanatory copy, colors, button labels, and restore behavior shown in the user-provided reference.

- [ ] **Step 4: Implement the pending cancellation server action**

Add to `src/features/orders/actions.ts`:

```ts
export async function setPendingOrderCancellationAction(
  eventId: string,
  merchant: Merchant,
  externalOrderId: string,
  cancelled: boolean
) {
  await requireOwner();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_pending_order_cancellation", {
    p_event_id: eventId,
    p_merchant: merchant,
    p_external_order_id: externalOrderId,
    p_cancelled: cancelled
  });
  if (error) orderError(merchant, externalOrderId, error);
  refreshOrder(merchant, externalOrderId);
}
```

In `src/features/orders/import-actions.ts`, include `manually_cancelled_at` in the list-import event select and reject non-null values with `new Error("该订单已手动取消，请先恢复订单")`. The Task 1 trigger remains the authoritative guard for list and detail imports.

- [ ] **Step 5: Wire list/detail queries and the pending detail layout**

Add `manually_cancelled_at` to both order-page event selects. Replace the stored-order cancellation markup with `OrderCancellationForm`.

For the pending payload branch, use a grid container with the import form as `className="contents"`, then place a sibling `OrderCancellationForm` in column two. Bind it as follows:

```tsx
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
    className="xl:col-start-2"
  />
) : null}
```

Keep the preview visible. Disable the import fieldsets and hide `ImportOrderButton` whenever `unified.canImport` is false. For manual cancellation, show “该订单已手动取消，恢复后可以继续导入。”; preserve the existing real-cancellation message for cancellation mail.

- [ ] **Step 6: Run UI, model, and import tests and verify GREEN**

Run:

```bash
pnpm test src/components/order-cancellation-form.test.tsx 'src/app/(app)/orders/[id]/[orderId]/page.test.tsx' src/features/orders/unified-orders.test.ts src/features/orders/import-form.test.ts
```

Expected: all selected tests PASS without React form-nesting warnings.

- [ ] **Step 7: Review all pending changes and commit**

Run `git diff --check`, inspect the complete `git diff`, check for nested forms, authorization gaps and secrets, fix and rerun focused tests, then commit:

```bash
git add src/components/order-cancellation-form.tsx src/components/order-cancellation-form.test.tsx 'src/app/(app)/orders/[id]/[orderId]/page.test.tsx' src/features/orders/actions.ts src/features/orders/import-actions.ts 'src/app/(app)/orders/page.tsx' 'src/app/(app)/orders/[id]/[orderId]/page.tsx'
git diff --cached --check
git diff --cached
git commit -m "feat: cancel pending orders from details"
```

### Task 3: iMusic quantity multiplier regression

**Files:**
- Modify: `src/features/mail/imusic-parser.test.ts`
- Modify: `src/features/mail/imusic-parser.ts`

**Interfaces:**
- Produces: item-row price parsing that returns `{ currency, amount, quantity }` while summary `parsePrice` behavior stays unchanged.

- [ ] **Step 1: Add the failing real-template regression test**

Build the case from the sanitized fixture by changing the second row price to a two-copy price and reconciling the totals:

```ts
it("parses an iMusic quantity multiplier from the item price cell", async () => {
  const source = (await fixture("order-acknowledgment.eml"))
    .toString("utf8")
    .replace("CNY 182.00</td>", "2 × CNY 182.00</td>")
    .replace("CNY 430.00</td>", "CNY 612.00</td>")
    .replace("CNY 528.00</td>", "CNY 710.00</td>");

  await expect(parseImusicMessage(source)).resolves.toMatchObject({
    itemsSubtotal: "612.00",
    total: "710.00",
    items: [
      { unitPrice: "248.00", quantity: 1 },
      { unitPrice: "182.00", quantity: 2 }
    ]
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `pnpm test src/features/mail/imusic-parser.test.ts`.

Expected: FAIL with the item subtotal reconciliation error because the second item quantity is still `1`.

- [ ] **Step 3: Implement minimal multiplier parsing**

Add an item-only parser that accepts optional positive integer multipliers before the currency token:

```ts
function parseItemPrice(input: string) {
  const normalized = input.replace(/\u00a0/g, " ").trim();
  const multiplier = normalized.match(/^(\d+)\s*[×x]\s*/i);
  const price = parsePrice(normalized);
  const quantity = multiplier ? Number(multiplier[1]) : 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error(`无法解析商品数量：${input}`);
  }
  return { ...price, quantity };
}
```

Use `parseItemPrice` only for product rows and assign its quantity to `ParsedOrderItem`. Continue using `parsePrice` for all summary rows.

- [ ] **Step 4: Run iMusic and schema regression tests and verify GREEN**

Run:

```bash
pnpm test src/features/mail/imusic-parser.test.ts src/features/mail/order-mail-parser.test.ts src/features/orders/import-form.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 5: Review all pending changes and commit**

Review the full diff and staged diff, check that summary amounts cannot acquire quantity multipliers, fix any issue, rerun tests, then commit:

```bash
git add src/features/mail/imusic-parser.ts src/features/mail/imusic-parser.test.ts
git diff --cached --check
git diff --cached
git commit -m "fix: parse imusic item quantities"
```

### Task 4: HMV Japan exact new confirmation subject

**Files:**
- Modify: `src/features/mail/hmv-parser.test.ts`
- Modify: `src/features/mail/hmv-parser.ts`
- Modify: `src/features/mail/imap-gateway.test.ts`
- Modify: `src/features/mail/imap-gateway.ts`

**Interfaces:**
- Produces: exact order-confirmation classification for `Thank you for your order.`.
- Produces: a QQ IMAP subject query for that same exact subject.

- [ ] **Step 1: Add failing classifier, parser, and query tests**

Add the new title to the classifier table. Add a parser test that changes only the sanitized HMV fixture subject and expects the existing eight-item payload. Add `{ subject: "Thank you for your order." }` to the expected HMV query array in `imap-gateway.test.ts`.

```ts
it("parses the new HMV order-confirmation subject", async () => {
  const source = (await fixture("hmv-order-confirmation.eml"))
    .toString("utf8")
    .replace("Thank you for your payment of order.", "Thank you for your order.");

  await expect(parseHmvMessage(source)).resolves.toMatchObject({
    merchant: "hmv",
    type: "order_confirmation",
    externalOrderId: "91000001",
    itemsSubtotal: "44440",
    shippingTotal: "330",
    total: "14660"
  });
});
```

- [ ] **Step 2: Run HMV and IMAP tests and verify RED**

Run:

```bash
pnpm test src/features/mail/hmv-parser.test.ts src/features/mail/imap-gateway.test.ts
```

Expected: FAIL because classification returns `null` and the query is absent.

- [ ] **Step 3: Add the exact title to production rules**

Add this entry to both the HMV parser subject map and `HMV_ORDER_SUBJECTS`:

```ts
"Thank you for your order."
```

Retain the old title and all strict sender-domain checks.

- [ ] **Step 4: Run multi-merchant regression tests and verify GREEN**

Run:

```bash
pnpm test src/features/mail/hmv-parser.test.ts src/features/mail/imap-gateway.test.ts src/features/mail/order-mail-parser.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 5: Review all pending changes and commit**

Review every pending line, confirm no marketing subjects or lookalike domains are accepted, rerun tests, then commit:

```bash
git add src/features/mail/hmv-parser.ts src/features/mail/hmv-parser.test.ts src/features/mail/imap-gateway.ts src/features/mail/imap-gateway.test.ts
git diff --cached --check
git diff --cached
git commit -m "fix: sync new hmv confirmation subject"
```

### Task 5: Full verification, production deployment, and recovery sync

**Files:**
- Verify all changed files from Tasks 1–4.
- No new source files unless verification reveals a root-cause-related defect.

**Interfaces:**
- Consumes: the migration, UI action, unified state, and both parser fixes.
- Produces: a Ready Vercel production deployment and recovered production mail events.

- [ ] **Step 1: Run the complete local verification suite**

Run each command independently and require exit code `0` with no warnings that indicate broken behavior:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

- [ ] **Step 2: Perform the mandatory final diff review**

Run:

```bash
git status --short
git diff --check
git log --oneline -8
```

Inspect every task commit with `git show --stat` and `git show`. Confirm there are no secrets, raw email bodies, personal product data, unrelated edits, nested forms, broadened sender rules, or missing query fields. Fix any actionable issue with a failing regression test and a separate reviewed commit.

- [ ] **Step 3: Apply the Supabase migration**

Apply `202608090001_pending_order_cancellation.sql` to the linked production Supabase project. Verify the migration succeeds, then query only schema metadata to confirm the column, RPC, trigger, grants, and RLS remain present. Do not print secrets or raw order contents.

- [ ] **Step 4: Deploy and wait for Vercel Ready**

Run the linked-project production deployment:

```bash
pnpm dlx vercel@latest --prod --yes
```

Poll deployment status until it is `Ready`; do not start recovery sync against an older deployment.

- [ ] **Step 5: Execute one-year full mail recovery sync**

Call `runOwnerMailSync(owner.user_id, "full")` with the production environment. Expected result: `status: "succeeded"` and `failedCount: 0`. Full mode must reprocess the existing failed iMusic event and discover the previously unmatched HMV message.

- [ ] **Step 6: Verify the three production outcomes without exposing private data**

Use read-only, sanitized queries to confirm:

- the specified CDJapan confirmation event remains pending and can persist `manually_cancelled_at` through the new RPC;
- the 2026-08-08 iMusic event is now `pending`, has no parse errors, has eight product rows, and includes one item with quantity `2`;
- the 2026-08-08 HMV event now exists as a `pending` order confirmation, has no parse errors, and has seven product rows;
- the production app renders the pending cancellation control and hides import while manually cancelled.

If a UI verification toggles the specified pending order, restore it to its original uncancelled state before finishing.

- [ ] **Step 7: Report evidence**

Report commit hashes, verification command results, migration/deployment status, sanitized sync counts, and the final state of all three reported issues. Do not claim completion until `superpowers:verification-before-completion` has been invoked and its checklist satisfied.
