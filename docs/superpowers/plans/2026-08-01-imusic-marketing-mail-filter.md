# iMusic Marketing Mail Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents for this plan.

**Goal:** Exclude iMusic marketing mail at the QQ IMAP server search stage while retaining local exact header validation.

**Architecture:** Extract construction of the ImapFlow `SearchObject` into a pure exported function. The gateway uses this function so tests can verify that initial and incremental searches combine the sender domain with an OR of the three supported business subjects.

**Tech Stack:** TypeScript, ImapFlow, Vitest

## Global Constraints

- Search only `Order Acknowledgment`, `Your order has been dispatched`, and `Order cancelled` subjects from `imusic.dk`.
- Preserve `SINCE` for initial scans and UID ranges for incremental scans.
- Preserve the existing local exact classifier and read-only IMAP behavior.
- Do not open subagents.

---

### Task 1: Add server-side subject filtering

**Files:**
- Modify: `src/features/mail/imap-gateway.ts`
- Create: `src/features/mail/imap-gateway.test.ts`

**Interfaces:**
- Consumes: `{ since?: Date; uidFrom?: number }`
- Produces: `buildImusicSearchQuery(criteria): SearchObject`

- [ ] **Step 1: Write the failing tests**

```ts
expect(buildImusicSearchQuery({ since })).toEqual({
  from: "imusic.dk",
  since,
  or: [
    { subject: "Order Acknowledgment" },
    { subject: "Your order has been dispatched" },
    { subject: "Order cancelled" }
  ]
});

expect(buildImusicSearchQuery({ uidFrom: 101 })).toMatchObject({
  uid: "101:*",
  or: expect.any(Array)
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test src/features/mail/imap-gateway.test.ts`

Expected: FAIL because `buildImusicSearchQuery` is not exported.

- [ ] **Step 3: Implement the minimal query builder**

```ts
export function buildImusicSearchQuery(criteria: { since?: Date; uidFrom?: number }): SearchObject {
  const query: SearchObject = {
    from: "imusic.dk",
    or: IMUSIC_ORDER_SUBJECTS.map((subject) => ({ subject }))
  };
  if (criteria.since) query.since = criteria.since;
  if (criteria.uidFrom) query.uid = `${criteria.uidFrom}:*`;
  return query;
}
```

Update `QqImapGateway.search` to pass the returned query to ImapFlow.

- [ ] **Step 4: Verify GREEN and regressions**

Run:

```bash
pnpm test src/features/mail/imap-gateway.test.ts
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all commands pass and the new tests prove both initial and incremental queries include subject filtering.

- [ ] **Step 5: Commit**

```bash
git add src/features/mail/imap-gateway.ts src/features/mail/imap-gateway.test.ts
git commit -m "perf: exclude iMusic marketing mail from sync"
```
