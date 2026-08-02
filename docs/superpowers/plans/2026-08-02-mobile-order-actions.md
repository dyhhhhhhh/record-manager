# Mobile Order Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the mobile “导入/详情” controls into the order ID row while preserving the current desktop order columns and all existing actions.

**Architecture:** Extract the repeated order-row markup from the orders page into a focused server component. Use one responsive CSS Grid: two columns and two rows below `768px`, reset to the existing stacked tablet flow at `md`, and retain the existing five-column layout at `lg`; the same action elements move through explicit grid placement, so no duplicate controls are rendered.

**Tech Stack:** Next.js App Router, React 19 Server Components and Server Actions, TypeScript, Tailwind CSS, Vitest, Testing Library, Playwright.

## Global Constraints

- All work is performed inline by the current main agent; do not create or delegate subagents.
- Only the mobile order-card layout changes; desktop behavior remains unchanged.
- Buttons retain text labels, existing actions, pending state, and a minimum height of `44px`.
- Do not add dependencies, database migrations, or changes to order/import business logic.
- Review all staged, unstaged, and untracked changes before committing; fix and re-review until no actionable issue remains.

---

### Task 1: Extract and reposition the order-row actions

**Files:**
- Create: `src/components/order-list-row.test.tsx`
- Create: `src/components/order-list-row.tsx`
- Modify: `src/app/(app)/orders/page.tsx`
- Modify: `tests/e2e/authenticated-workflow.spec.ts`

**Interfaces:**
- Consumes: `UnifiedOrderRow` from `src/features/orders/unified-orders.ts`, `importOrderFromListAction(eventId, formData)`, `ImportOrderButton`, `OrderStatus`, and `formatShanghaiDate`.
- Produces: `OrderListRow({ order }: { order: UnifiedOrderRow }): React.ReactElement`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/order-list-row.test.tsx` with a realistic stored order and a pending-import variant. Assert that one action group is placed in mobile grid row 1/column 2, the information panel spans mobile row 2, and desktop grid placement resets without rendering duplicate controls.

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderListRow } from "@/components/order-list-row";
import type { UnifiedOrderRow } from "@/features/orders/unified-orders";

vi.mock("@/features/orders/import-actions", () => ({
  importOrderFromListAction: vi.fn()
}));

const storedOrder: UnifiedOrderRow = {
  externalOrderId: "13772603",
  orderId: "stored-order",
  confirmationEventId: null,
  orderedAt: "2026-07-29T00:00:00Z",
  currency: "CNY",
  total: "2146.00",
  state: "ordered",
  canImport: false,
  items: [],
  payload: null,
  events: []
};

describe("OrderListRow", () => {
  it("places the single mobile action group beside the order identity", () => {
    render(<OrderListRow order={storedOrder} />);

    const row = screen.getByRole("article", { name: "订单 13772603" });
    const actions = screen.getByRole("group", { name: "订单操作" });
    const information = screen.getByRole("group", { name: "订单信息" });

    expect(row).toHaveClass("grid-cols-[minmax(0,1fr)_auto]", "lg:grid-cols-[minmax(0,1fr)_120px_120px_120px_auto]");
    expect(actions).toHaveClass("col-start-2", "row-start-1", "md:col-start-auto", "md:row-start-auto");
    expect(information).toHaveClass("col-span-2", "row-start-2", "md:col-span-1", "lg:contents");
    expect(screen.getAllByRole("link", { name: "详情" })).toHaveLength(1);
  });

  it("keeps import and detail together without duplicating either action", () => {
    render(<OrderListRow order={{ ...storedOrder, orderId: null, confirmationEventId: "event-1", state: "pending_import", canImport: true }} />);

    expect(screen.getAllByRole("button", { name: "导入" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "详情" })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- --run src/components/order-list-row.test.tsx
```

Expected: FAIL because `@/components/order-list-row` does not exist.

- [ ] **Step 3: Implement the focused order-row component**

Create `src/components/order-list-row.tsx` with the complete implementation below:

```tsx
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { ImportOrderButton } from "@/components/import-order-button";
import { OrderStatus } from "@/components/order-status";
import { importOrderFromListAction } from "@/features/orders/import-actions";
import type { UnifiedOrderRow } from "@/features/orders/unified-orders";
import { formatShanghaiDate } from "@/lib/date-time";

const EVENT_LABELS = {
  order_confirmation: "下单",
  shipment: "发货",
  cancellation: "取消"
} as const;

export function OrderListRow({ order }: { order: UnifiedOrderRow }) {
  const eventTypes = (["order_confirmation", "shipment", "cancellation"] as const)
    .filter((eventType) => order.events.some((event) => event.event_type === eventType));
  const detailHref = `/orders/${encodeURIComponent(order.externalOrderId)}`;

  return (
    <article
      aria-label={`订单 ${order.externalOrderId}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[var(--line)] p-4 last:border-b-0 hover:bg-white/60 sm:p-5 md:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_120px_120px_120px_auto] lg:items-center"
    >
      <div className="col-start-1 row-start-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 md:col-start-auto md:row-start-auto">
        <Link className="group inline-flex min-h-11 shrink-0 items-center gap-2 text-lg font-bold hover:text-[var(--green)]" href={detailHref}>
          #{order.externalOrderId}<ArrowUpRight aria-hidden="true" className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" size={16} />
        </Link>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {eventTypes.map((eventType) => (
            <span className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]" key={eventType}>
              {EVENT_LABELS[eventType]}
            </span>
          ))}
        </div>
      </div>

      <div aria-label="订单信息" className="col-span-2 row-start-2 grid grid-cols-2 gap-3 rounded-2xl bg-black/[0.025] p-3 sm:grid-cols-3 md:col-span-1 md:row-start-auto lg:contents" role="group">
        <div className="min-w-0">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)] lg:sr-only">下单日期</span>
          <time className="text-sm text-[var(--muted)]">{order.orderedAt ? formatShanghaiDate(order.orderedAt) : "—"}</time>
        </div>
        <div className="min-w-0">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)] lg:sr-only">状态</span>
          <OrderStatus state={order.state} />
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)] lg:sr-only">金额</span>
          <strong>{order.currency && order.total ? `${order.currency} ${order.total}` : "—"}</strong>
        </div>
      </div>

      <div aria-label="订单操作" className="col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-2 self-start md:col-span-1 md:col-start-auto md:row-start-auto md:self-auto lg:self-center" role="group">
        {order.canImport && order.confirmationEventId ? (
          <form action={importOrderFromListAction.bind(null, order.confirmationEventId)}>
            <ImportOrderButton compact />
          </form>
        ) : null}
        <Link className="inline-flex h-11 shrink-0 items-center rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-semibold" href={detailHref}>详情</Link>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Integrate the component into the orders page**

In `src/app/(app)/orders/page.tsx`, remove `ArrowUpRight`, `ImportOrderButton`, `OrderStatus`, `importOrderFromListAction`, `formatShanghaiDate`, and `EVENT_LABELS` from the page. Import `OrderListRow` and replace the inline mapping body with:

```tsx
{orders.length
  ? orders.map((order) => <OrderListRow key={order.externalOrderId} order={order} />)
  : <p className="p-16 text-center text-[var(--muted)]">没有符合条件的订单。</p>}
```

- [ ] **Step 5: Run the component test and verify GREEN**

Run:

```bash
npm test -- --run src/components/order-list-row.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 6: Extend the mobile Playwright assertion**

In `tests/e2e/authenticated-workflow.spec.ts`, after navigating to `/orders`, conditionally inspect the first order row when one exists. Confirm its order ID link and action group share the same top coordinate within a small tolerance and the page has no horizontal overflow.

```ts
const firstOrder = page.getByRole("article", { name: /^订单 / }).first();
if (await firstOrder.count()) {
  const identityBox = await firstOrder.getByRole("link", { name: /^#/ }).boundingBox();
  const actionsBox = await firstOrder.getByRole("group", { name: "订单操作" }).boundingBox();
  expect(Math.abs((identityBox?.y ?? 0) - (actionsBox?.y ?? 0))).toBeLessThan(8);
}
expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
```

- [ ] **Step 7: Run complete verification**

Run:

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run test:e2e
npm run build
```

Expected: Vitest, typecheck, lint, and build pass. Public Playwright tests pass; authenticated tests may skip when `E2E_AUTH_STORAGE` is unset and must be reported accurately.

- [ ] **Step 8: Review and commit**

Review all staged, unstaged, and untracked files. Fix any correctness, responsive-layout, accessibility, or test issues and repeat verification/review until no actionable issue remains. Then commit:

```bash
git add src/components/order-list-row.tsx src/components/order-list-row.test.tsx 'src/app/(app)/orders/page.tsx' tests/e2e/authenticated-workflow.spec.ts
git commit -m "feat: align mobile order actions with order id"
```
