# Independent Store Mail Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, sample-backed order-mail support for Mutant, Black Screen Records, and Laced Records while preserving iMusic/HMV behavior and normalizing every observed logistics message to the existing “已发货” state.

**Architecture:** Route all supported mail through a merchant-adapter registry. Keep merchant identity and header trust rules inside each adapter, share only the observed Shopify structural extraction between Mutant and Laced, and use dedicated OrderlyEmails and Sendcloud extraction for Black Screen Records. Continue storing the existing unified payloads and isolating orders by user, merchant, and external order ID.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Zod 4, mailparser, imapflow, Cheerio, Supabase PostgreSQL/Storage, Vitest, Testing Library.

## Global Constraints

- All work is performed inline by the current main agent; do not create, call, or delegate subagents.
- Treat `docs/superpowers/specs/2026-08-02-independent-store-mail-support-design.md` as the approved source of truth.
- Preserve all existing iMusic/HMV behavior and all pre-existing working-tree changes; the new database migration must follow `202608020001_hmv_mail_support.sql`.
- Only support the exact sample-backed subjects and trust conditions in the approved design. Do not infer cancellation support or Mutant shipment support.
- Every observed logistics subject produces `type: "shipment"`; neither “out for delivery” nor “delivered” may mark an order received.
- Import every confirmation line item. Store a non-default product variant in `albumTitle` as `商品名 · 规格`; use `未知艺人` when no stable artist field exists.
- Never crawl product pages. Accept product links only from the configured official host and covers only from HTTPS `cdn.shopify.com/s/files/...` URLs associated with the current product row.
- Do not persist raw message bodies or include real names, addresses, email addresses, order IDs, tracking IDs, real product titles, or identifiable product handles in fixtures.
- Use test-driven development for every behavior change: write the focused failing test, verify RED for the intended reason, make the smallest implementation, then verify GREEN.
- Before every commit, review every staged file and the complete staged diff, run `git diff --cached --check`, fix all actionable issues, and repeat the review.

---

### Task 1: Expand the merchant domain and database constraints

**Files:**
- Modify: `src/types/domain.test.ts`
- Modify: `src/types/domain.ts`
- Modify: `src/lib/merchant.ts`
- Modify: `src/features/orders/collection.ts`
- Modify: `src/features/orders/unified-orders.test.ts`
- Modify: `src/features/orders/unified-orders.ts`
- Create: `supabase/migrations/202608020002_independent_store_mail_support.sql`
- Modify: `src/lib/database/migration.test.ts`
- Modify: `supabase/tests/rls.test.sql`

**Interfaces:**
- `Merchant = "imusic" | "hmv" | "mutant" | "black_screen" | "laced"`.
- `MERCHANT_LABELS` remains an exhaustive `Record<Merchant, string>`.
- Add `MERCHANT_OPTIONS` as a shared readonly list so the filter UI and validation do not duplicate merchant literals.
- Existing compound identity remains `user_id + merchant + external_order_id`; no new table or amount column is introduced.

- [ ] **Step 1: Write failing domain, filter, and migration tests**

Update `src/types/domain.test.ts` to assert the exact five schema options and successful parsing of representative confirmation/shipment payloads for each new key. Update `src/features/orders/unified-orders.test.ts` with five rows sharing the same external order ID and assert that each remains distinct and can be selected independently by merchant. Add a migration assertion in `src/lib/database/migration.test.ts`:

```ts
const independentStoreSupportPath = join(
  process.cwd(),
  "supabase/migrations/202608020002_independent_store_mail_support.sql"
);

it("extends order and mail-event merchant constraints to all five merchants", () => {
  const sql = readFileSync(independentStoreSupportPath, "utf8");
  expect(sql).toContain("'mutant', 'black_screen', 'laced'");
  expect(sql).toContain("alter table public.mail_events");
  expect(sql).toContain("alter table public.orders");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm test -- src/types/domain.test.ts src/features/orders/unified-orders.test.ts src/lib/database/migration.test.ts
```

Expected: FAIL because the new merchant keys, filter behavior, and migration do not exist.

- [ ] **Step 3: Implement the five-merchant domain model**

In `src/types/domain.ts`:

```ts
export const merchantSchema = z.enum([
  "imusic",
  "hmv",
  "mutant",
  "black_screen",
  "laced"
]);
```

In `src/lib/merchant.ts`, keep labels and options in one exhaustive module:

```ts
export const MERCHANT_LABELS: Record<Merchant, string> = {
  imusic: "iMusic",
  hmv: "HMV Japan",
  mutant: "Mutant",
  black_screen: "Black Screen Records",
  laced: "Laced Records"
};

export const MERCHANT_OPTIONS = merchantSchema.options.map((value) => ({
  value,
  label: MERCHANT_LABELS[value]
}));
```

Change `CollectionOrder.merchant` to `Merchant`. In `filterUnifiedOrderRows`, use `merchantSchema.safeParse(filter.merchant)` rather than a two-literal condition; invalid values still resolve to `all`.

- [ ] **Step 4: Add the additive database migration**

Create `supabase/migrations/202608020002_independent_store_mail_support.sql`. Drop and recreate only the merchant check constraints:

```sql
alter table public.mail_events
  drop constraint if exists mail_events_merchant_check,
  add constraint mail_events_merchant_check
    check (merchant in ('imusic', 'hmv', 'mutant', 'black_screen', 'laced'));

alter table public.orders
  drop constraint if exists orders_merchant_check,
  add constraint orders_merchant_check
    check (merchant in ('imusic', 'hmv', 'mutant', 'black_screen', 'laced'));
```

Extend `supabase/tests/rls.test.sql` with inserted rows that demonstrate the new merchant values are accepted without weakening owner-only RLS or compound order uniqueness.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
pnpm test -- src/types/domain.test.ts src/features/orders/unified-orders.test.ts src/features/orders/collection.test.ts src/lib/database/migration.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 6: Review and commit the merchant foundation**

Review all pending changes, stage only the task files when they can be isolated safely, review the complete staged diff, then commit:

```bash
git commit -m "feat: add independent store merchant keys"
```

---

### Task 2: Carry trusted mail identity through IMAP and register adapters

**Files:**
- Create: `src/features/mail/order-mail-adapter.ts`
- Modify: `src/features/mail/order-mail-parser.test.ts`
- Modify: `src/features/mail/order-mail-parser.ts`
- Modify: `src/features/mail/mail-sync.test.ts`
- Modify: `src/features/mail/mail-sync.ts`
- Modify: `src/features/mail/imap-gateway.test.ts`
- Modify: `src/features/mail/imap-gateway.ts`

**Interfaces:**

```ts
export type OrderMailHeaders = {
  from: string;
  fromName: string;
  replyTo: string;
  subject: string;
};

export type OrderMailAdapter = {
  merchant: Merchant;
  classify(headers: OrderMailHeaders): MailEventType | null;
  parse(message: ParsedMail): MailEventPayload | null;
};
```

- `MailHeader` adds `fromName` and `replyTo`.
- `SyncMailboxInput.classify` accepts all four trusted header fields.
- `classifyOrderHeaders()` and `parseOrderMessage()` continue to use the existing iMusic/HMV adapters in this task; the three new adapters join the same registry in Task 6 after their parsers exist.
- `parseOrderMessage()` parses the source once, rebuilds the same four fields from `ParsedMail`, selects the same adapter, and lets that adapter revalidate before parsing.

- [ ] **Step 1: Write failing header-plumbing tests**

Extend `src/features/mail/order-mail-parser.test.ts` to call the existing classifiers with the expanded header shape and prove iMusic/HMV behavior is unchanged. Extend `src/features/mail/mail-sync.test.ts` with a header containing a display name and Reply-To and use a capturing classifier:

```ts
const seenHeaders: OrderMailHeaders[] = [];
const classify = (headers: OrderMailHeaders) => {
  seenHeaders.push(headers);
  return headers.subject === "Order 70000001 confirmed"
    ? { merchant: "black_screen" as const, type: "order_confirmation" as const }
    : null;
};

const header = {
  uid: 14,
  messageId: "<black-screen@test>",
  from: "updates@sendcloud.com",
  fromName: "Black Screen Records",
  replyTo: "orders@blackscreenrecords.com",
  subject: "Order 70000001 confirmed",
  receivedAt: new Date("2026-08-01T00:00:00Z")
};
```

Assert `seenHeaders` contains all four identity fields before the matching source is fetched. Exact new-store positive/negative classification cases are added with the adapters in Tasks 4–6.

- [ ] **Step 2: Write the expected five-merchant IMAP query test**

Update `src/features/mail/imap-gateway.test.ts` to assert one outer `or` containing:

- iMusic and HMV clauses unchanged.
- Mutant `from: "madebymutant.com"` plus `order`/`confirmed` subject terms.
- Black Screen confirmation from `blackscreenrecords.com`.
- Black Screen Sendcloud shipment subjects under `from: "sendcloud.com"`.
- Laced confirmation and three shipment subject prefixes under `from: "lacedmusic.com"`.
- Existing `since` and `uid` criteria unchanged.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
pnpm test -- src/features/mail/order-mail-parser.test.ts src/features/mail/mail-sync.test.ts src/features/mail/imap-gateway.test.ts
```

Expected: FAIL because the identity fields and expanded IMAP query are absent.

- [ ] **Step 4: Implement the adapter boundary and header plumbing**

Create `order-mail-adapter.ts` with the interfaces above plus small pure helpers for extracting an exact email domain and `ParsedMail` identity. Default missing display name and Reply-To to empty strings, never to the From address.

Update `QqImapGateway.fetchHeaders()`:

```ts
from: message.envelope?.from?.[0]?.address ?? "",
fromName: message.envelope?.from?.[0]?.name?.trim() ?? "",
replyTo: message.envelope?.replyTo?.[0]?.address ?? "",
```

Pass all four fields through `syncMailbox`. Convert the existing iMusic/HMV routing in `order-mail-parser.ts` to the typed adapter registry without broadening either parser rule. Task 6 appends the three new adapters only after their parsing tests pass.

- [ ] **Step 5: Extend the IMAP prefilter**

Build the nested `SearchObject` from explicit merchant clauses. The IMAP query is only a performance/privacy prefilter; exact order-number anchoring and the Black Screen display-name/Reply-To requirements remain enforced by `classifyOrderHeaders` before any body fetch.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm test -- src/features/mail/order-mail-parser.test.ts src/features/mail/mail-sync.test.ts src/features/mail/imap-gateway.test.ts
```

Expected: all focused tests pass and marketing/near-match headers still do not fetch a body.

- [ ] **Step 7: Review and commit the adapter boundary**

Review and stage only the task files when safe, then commit:

```bash
git commit -m "refactor: route order mail through trusted adapters"
```

---

### Task 3: Add sanitized fixtures and shared money/link helpers

**Files:**
- Create: `src/features/mail/fixtures/mutant-order-confirmation.eml`
- Create: `src/features/mail/fixtures/black-screen-order-confirmation.eml`
- Create: `src/features/mail/fixtures/black-screen-ready-to-ship.eml`
- Create: `src/features/mail/fixtures/black-screen-delivered.eml`
- Create: `src/features/mail/fixtures/laced-order-confirmation-single.eml`
- Create: `src/features/mail/fixtures/laced-order-confirmation-multiple.eml`
- Create: `src/features/mail/fixtures/laced-on-the-way.eml`
- Create: `src/features/mail/fixtures/laced-out-for-delivery.eml`
- Create: `src/features/mail/fixtures/laced-delivered.eml`
- Create: `src/features/mail/store-mail-utils.test.ts`
- Create: `src/features/mail/store-mail-utils.ts`
- Modify: `src/features/covers/trusted-cover-url.test.ts`
- Modify: `src/features/covers/trusted-cover-url.ts`

**Interfaces:**

```ts
export function parseLocalizedMoney(value: string): string;
export function divideLineTotal(lineTotal: string, quantity: number): string;
export function combineProductAndVariant(product: string, variant: string): string;
export function canonicalizeStoreProductUrl(value: string, merchant: Merchant): string | null;
export function canonicalizeShopifyCoverUrl(value: string): string | null;
```

- Money helpers operate in integer minor units and preserve exact cents.
- `divideLineTotal()` throws when the line total is not evenly divisible by quantity at two-decimal precision.
- Product URLs accept HTTPS only and exactly the root or `www` official host for the current merchant.
- Shopify covers accept HTTPS `cdn.shopify.com` only when the path begins `/s/files/`; no global logo or unrelated image selector is searched.

- [ ] **Step 1: Create privacy-safe structural fixtures**

Reconstruct only the minimum observed MIME and HTML structure needed by the parser. Use synthetic identities and orders:

- Mutant: order `51000001`, two synthetic items, CNY amounts.
- Black Screen: order `71000001`, one synthetic item, EUR decimal-comma amounts; two Sendcloud status messages.
- Laced: orders `LREU61000001` and `LREU61000002`, one- and two-item confirmations; three status messages.

Replace product handles and image file IDs with synthetic values such as `/products/synthetic-score-a` and `/s/files/1/0000/0001/files/synthetic-score-a.jpg`. Do not copy addresses, tracking URLs, hidden identifiers, or full original text.

- [ ] **Step 2: Write failing utility and whitelist tests**

Cover:

```ts
expect(parseLocalizedMoney("€214,90")).toBe("214.90");
expect(parseLocalizedMoney("CNY ¥1,234.00")).toBe("1234.00");
expect(divideLineTotal("39.98", 2)).toBe("19.99");
expect(() => divideLineTotal("10.00", 3)).toThrow(/无法精确换算单价/);
```

Assert allowed and rejected cover/product URLs for every merchant, including HTTP, credentials, non-Shopify paths, lookalike hosts, arbitrary Shopify CDN logos, and a Laced `.com` product link when only `.co` is allowed for mail imports.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
pnpm test -- src/features/mail/store-mail-utils.test.ts src/features/covers/trusted-cover-url.test.ts
```

Expected: FAIL because utility functions and independent-store whitelists do not exist.

- [ ] **Step 4: Implement integer-safe helpers and whitelists**

Normalize decimal comma/dot by treating the last separator followed by one or two digits as decimal and earlier separators as grouping. Convert to minor units, divide exactly, and return a schema-compatible non-negative decimal string. Reject negative or ambiguous input.

Map official product hosts:

```ts
const PRODUCT_HOSTS: Partial<Record<Merchant, ReadonlySet<string>>> = {
  mutant: new Set(["madebymutant.com", "www.madebymutant.com"]),
  black_screen: new Set(["blackscreenrecords.com", "www.blackscreenrecords.com"]),
  laced: new Set(["lacedrecords.co", "www.lacedrecords.co"])
};
```

Update `isTrustedCoverUrl()` with exhaustive merchant branches: iMusic and HMV retain existing rules; the three new merchants share the strict Shopify cover canonicalizer.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
pnpm test -- src/features/mail/store-mail-utils.test.ts src/features/covers/trusted-cover-url.test.ts
```

Expected: all utility and whitelist cases pass.

- [ ] **Step 6: Audit fixtures and commit**

Run repository searches for real mailbox addresses, known real order IDs, tracking parameters, address labels, and long raw-body fragments. Review every fixture in full, then commit only after the privacy audit passes:

```bash
git commit -m "test: add sanitized independent store mail fixtures"
```

---

### Task 4: Parse Shopify confirmations for Mutant and Laced

**Files:**
- Create: `src/features/mail/shopify-order-parser.test.ts`
- Create: `src/features/mail/shopify-order-parser.ts`
- Create: `src/features/mail/mutant-parser.test.ts`
- Create: `src/features/mail/mutant-parser.ts`
- Create: `src/features/mail/laced-parser.test.ts`
- Create: `src/features/mail/laced-parser.ts`

**Interfaces:**

```ts
type ShopifyConfirmationConfig = {
  merchant: "mutant" | "laced";
  shippingFallback: "Mutant 配送" | "Laced Records 配送";
};

export function parseShopifyConfirmationHtml(
  html: string,
  config: ShopifyConfirmationConfig
): Omit<OrderConfirmationPayload, "merchant" | "type" | "externalOrderId" | "occurredAt">;

export function parseShopifyShipmentDetails(
  html: string,
  merchant: "laced"
): { items: ParsedOrderItem[]; itemHints: string[] };
```

- Product rows are `.order-list__item` only.
- Product title/quantity comes from `.order-list__item-title`; a stable non-default `.order-list__item-variant` is appended with ` · `.
- Cover comes only from that row’s `.order-list__product-image`.
- Product URL comes only from that row’s product anchor and passes the merchant whitelist.
- Summary labels are normalized for `Subtotal`, `Discount`, `Shipping`, `Taxes`, and `Total`; the Total row must include one ISO currency.

- [ ] **Step 1: Write failing Shopify extraction tests**

Test both confirmation fixture shapes and direct HTML edge cases. Assertions must cover:

- Mutant two items, CNY, exact quantity/unit price, fallback shipping method, missing discount as `0`, variant inclusion, and two trusted covers.
- Laced single and multiple item confirmations, including a valid item whose name contains no “vinyl” marker.
- Non-product images and attacker-hosted images/links are omitted.
- Missing total ISO currency, mixed/inconsistent currency labels, missing required summaries, missing items, negative amounts, accounting imbalance, and imprecise per-unit division throw clear errors.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm test -- src/features/mail/shopify-order-parser.test.ts src/features/mail/mutant-parser.test.ts src/features/mail/laced-parser.test.ts
```

Expected: FAIL because the Shopify extractor and merchant parsers are absent.

- [ ] **Step 3: Implement row-local Shopify extraction**

Use Cheerio per `.order-list__item`; never collect all page images. Convert each line total to an exact unit price and feed the final object through `mailEventPayloadSchema`, which rechecks item subtotal and payable total. Treat tax as included metadata only.

For shipping method, use an explicit template value when the row provides a non-amount descriptor; otherwise use the merchant fallback. Do not infer a carrier from tracking links.

- [ ] **Step 4: Implement Mutant classification and parsing**

`classifyMutantHeaders()` requires exact domain `madebymutant.com` and `/^order (\d+) confirmed$/i`. `parseMutantParsedMessage()` revalidates the full parsed header, validates the date, obtains the numeric ID from the anchored subject, requires HTML, and returns a schema-parsed `order_confirmation` payload.

- [ ] **Step 5: Implement Laced confirmation classification and parsing**

Require exact From domain `lacedmusic.com`. Confirmation subject is `/^Order (LREU\d+) confirmed$/i`; preserve the normalized uppercase `LREU` prefix in `externalOrderId`. Require a valid date and HTML body.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm test -- src/features/mail/shopify-order-parser.test.ts src/features/mail/mutant-parser.test.ts src/features/mail/laced-parser.test.ts
```

Expected: confirmation parsing, rejection, amount, and trust tests all pass.

- [ ] **Step 7: Review and commit Shopify confirmation support**

Review the full diff for broad selectors, silent amount coercion, or trust checks that only occur at download time. Then commit:

```bash
git commit -m "feat: parse Mutant and Laced confirmations"
```

---

### Task 5: Parse Laced and Black Screen logistics plus Orderly confirmations

**Files:**
- Modify: `src/features/mail/laced-parser.test.ts`
- Modify: `src/features/mail/laced-parser.ts`
- Create: `src/features/mail/black-screen-parser.test.ts`
- Create: `src/features/mail/black-screen-parser.ts`
- Modify: `src/features/mail/shopify-order-parser.test.ts`
- Modify: `src/features/mail/shopify-order-parser.ts`

**Interfaces:**

```ts
export function parseBlackScreenParsedMessage(message: ParsedMail): MailEventPayload | null;
export function classifyBlackScreenHeaders(headers: OrderMailHeaders): MailEventType | null;
```

- Laced `on the way`, `out for delivery`, and `has been delivered` subjects all return `shipment`.
- Black Screen confirmation uses the OrderlyEmails row structure and returns a complete confirmation payload.
- Black Screen Sendcloud status messages return empty `itemHints` and `items`, because the observed template has no trustworthy product metadata.

- [ ] **Step 1: Write failing Laced logistics tests**

Parse all three Laced status fixtures and assert:

```ts
expect(result).toMatchObject({
  merchant: "laced",
  type: "shipment",
  externalOrderId: "LREU61000001"
});
```

Assert that available row-local product title, quantity, trusted product URL, and cover are retained. If an observed status fixture omits a price required by `ParsedOrderItem`, keep only `itemHints` for that row rather than inventing `unitPrice`; the confirmation remains the source of accounting data.

- [ ] **Step 2: Write failing Black Screen tests**

Cover confirmation parsing with EUR decimal comma, quantity, exact per-unit price, included tax, fallback shipping, official product link, and row-local Shopify cover. Cover both Sendcloud subjects and all four trust requirements. Add negative cases for wrong display name, missing/wrong Reply-To, lookalike From domain, near-match subject, missing item rows, amount imbalance, and malicious links.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
pnpm test -- src/features/mail/laced-parser.test.ts src/features/mail/black-screen-parser.test.ts
```

Expected: FAIL because logistics and Black Screen parsing are incomplete.

- [ ] **Step 4: Implement Laced logistics parsing**

Use anchored, case-insensitive subjects:

```ts
/^A shipment from order (LREU\d+) is on the way$/i
/^A shipment from order (LREU\d+) is out for delivery$/i
/^A shipment from order (LREU\d+) has been delivered$/i
```

All return `mailEventPayloadSchema.parse({ type: "shipment", ... })`. Never return `received`, because `received` is an order fulfillment status and only manual order actions may set it.

- [ ] **Step 5: Implement Black Screen confirmation parsing**

Read only rows containing the observed Orderly product selectors (`.line-item-description`, `.line-item-qty`, `.line-item-line-price`, and row-local `.product-image`). Normalize European money, append a stable variant to the title, and validate the final accounting through the shared schema.

- [ ] **Step 6: Implement strict Sendcloud status parsing**

Accept a status subject only when all are true:

```ts
fromDomain === "sendcloud.com"
headers.fromName === "Black Screen Records"
replyToDomain === "blackscreenrecords.com"
subject matches one exact anchored status pattern
```

Reapply the same check to `ParsedMail` in `parseBlackScreenParsedMessage()`. Return `shipment` with empty item arrays.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
pnpm test -- src/features/mail/laced-parser.test.ts src/features/mail/black-screen-parser.test.ts src/features/mail/shopify-order-parser.test.ts
```

Expected: every observed logistics template maps to shipment and all trust/amount failures are rejected.

- [ ] **Step 8: Review and commit logistics/Black Screen support**

Review all parsing branches and fixtures, then commit:

```bash
git commit -m "feat: parse independent store shipment mail"
```

---

### Task 6: Integrate all adapters with sync, enrichment, and the UI

**Files:**
- Modify: `src/features/mail/order-mail-parser.test.ts`
- Modify: `src/features/mail/order-mail-parser.ts`
- Modify: `src/features/mail/mail-sync.test.ts`
- Modify: `src/features/mail/imap-gateway.test.ts`
- Modify: `src/features/covers/store-cover.ts`
- Modify: `src/features/orders/item-enrichment.test.ts`
- Modify: `src/features/orders/stored-item-enrichment.test.ts`
- Modify: `src/features/orders/unified-orders.test.ts`
- Modify: `src/app/(app)/orders/page.test.tsx`
- Modify: `src/app/(app)/orders/page.tsx`
- Modify: `src/components/order-list-row.test.tsx`
- Modify: `src/features/orders/collection.test.ts`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/orders/[id]/[orderId]/page.tsx`
- Modify: `README.md`

**Behavior:**
- The registry returns exactly one matching adapter for every supported header.
- Calendar-range scans skip known UID/Message-ID before fetching a body; full maintenance scans may reparse failed/existing messages as before.
- Confirmation-first and shipment-first events group by the five-merchant namespace already represented by `merchant + externalOrderId` within the user.
- Existing stored-item enrichment never overwrites a non-placeholder artist, non-null product URL, local image path, or manual cover.
- UI labels, links, filter options, pagination, detail validation, and collection cards work for all five merchants.

- [ ] **Step 1: Write failing registry and end-to-end model tests**

In `order-mail-parser.test.ts`, parse all nine fixtures through `parseOrderMessage`, not only through merchant-specific functions. In `mail-sync.test.ts`, include new merchant headers and assert only exact matches fetch bodies. In `unified-orders.test.ts`, cover shipment-first then confirmation and confirmation-first then shipment for Laced/Black Screen; both must resolve to `state: "shipped"`, never `received`.

- [ ] **Step 2: Write failing enrichment protection tests**

Add new-merchant URLs to item enrichment tests. Assert a Laced shipment can fill an empty trusted cover/product URL, but a stored local cover and edited artist remain unchanged. Assert a full rescan can retry a previously failed cover only when `image_path` is still null.

- [ ] **Step 3: Write failing five-merchant UI tests**

Assert:

- The merchant filter contains `全部厂商`, iMusic, HMV Japan, Mutant, Black Screen Records, and Laced Records.
- Selecting each new merchant combines with search/status and survives pagination.
- Order-list and collection links use `/orders/{merchant}/{encodedOrderId}`.
- The detail route accepts all five merchant keys and rejects arbitrary values.
- New confirmations with no artist/cover display `未知艺人` and the existing neutral placeholder.

- [ ] **Step 4: Run integration tests and verify RED**

Run:

```bash
pnpm test -- src/features/mail/order-mail-parser.test.ts src/features/mail/mail-sync.test.ts src/features/mail/imap-gateway.test.ts src/features/orders/item-enrichment.test.ts src/features/orders/stored-item-enrichment.test.ts src/features/orders/unified-orders.test.ts 'src/app/(app)/orders/page.test.tsx' src/components/order-list-row.test.tsx src/features/orders/collection.test.ts
```

Expected: FAIL on unregistered adapters and missing UI/filter coverage.

- [ ] **Step 5: Register and integrate adapters**

Add all five adapters in a deterministic readonly registry. `parseOrderMessage()` must select from headers derived from the parsed body source and call only the selected adapter. Keep payload/classification merchant and type consistency checks in `syncMailbox`.

Use `MERCHANT_OPTIONS` to build the order filter while retaining the existing tone styles. Keep `MERCHANT_LABELS` for cards/details and `merchantSchema` for route validation. Do not add a merchant-specific page or status.

- [ ] **Step 6: Confirm enrichment and download protections**

Ensure the parser supplies only canonical trusted URLs and `storeRemoteCover()` checks `isTrustedCoverUrl(sourceUrl, merchant)` again immediately before downloading. Reuse the existing `planStoredItemEnrichment()` rules; change them only if a focused test exposes a missing protection.

- [ ] **Step 7: Update documentation**

Update README to describe five merchants, exact supported messages, manual receipt after all logistics mail, no format filtering, privacy guarantees, migration order, and the post-deploy “一年” scan. State explicitly that Mutant shipment and all three new-store cancellations are not yet supported.

- [ ] **Step 8: Run integration tests and verify GREEN**

Run the same focused command from Step 4. Expected: all tests pass, including legacy iMusic/HMV cases.

- [ ] **Step 9: Review and commit the complete integration**

Review every pending change and all new fixtures. Stage and commit only when there are no correctness, privacy, trust-boundary, migration, or UI issues:

```bash
git commit -m "feat: integrate independent store mail orders"
```

---

### Task 7: Apply migration, verify the app, and perform the one-year sync

**Files:**
- Verify only: all files changed in Tasks 1–6
- Runtime state: configured Supabase database and QQ mailbox

- [ ] **Step 1: Run the full automated verification**

Stop the development server before the production build, then run in this order:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all four commands exit successfully. Fix failures with focused RED/GREEN tests and repeat the full sequence.

- [ ] **Step 2: Review the complete implementation diff**

Inspect staged, unstaged, and untracked files. Specifically verify:

- No raw email bodies or personal identifiers were committed.
- Every classifier is anchored and revalidated from `ParsedMail`.
- Sendcloud trust checks include From domain, exact display name, Reply-To domain, and exact subject.
- All delivered/out-for-delivery paths produce shipment only.
- Amounts are integer-safe and validated against both formulas.
- Product/image URLs are row-local and merchant-whitelisted.
- Existing local/manual covers and edited artists cannot be overwritten.
- SQL extends constraints without dropping user data or weakening RLS.

- [ ] **Step 3: Apply the new migration before syncing**

Use the repository’s configured Supabase migration workflow to apply `202608020002_independent_store_mail_support.sql`. Verify the remote migration history includes both HMV and independent-store migrations before running application sync.

- [ ] **Step 4: Restart the development server and execute a one-year sync**

Start `pnpm dev`, call the authenticated sync path with `range=1y`, and wait for completion. Report scanned, matched, and failed counts. Existing UID/Message-ID entries should be skipped by normal range mode; use hidden `mode=full` only when a parser correction requires reprocessing a known failed event.

- [ ] **Step 5: Validate imported event state without exposing mail content**

Query aggregate event metadata only. Verify:

- Mutant has confirmation events only.
- Black Screen has confirmation and shipment events.
- Laced has confirmation and shipment events.
- All parsed new-store events have empty parse errors.
- Black Screen/Laced delivered messages remain `shipment`; any related imported order is `shipped` until the user manually confirms receipt.

- [ ] **Step 6: Final review and handoff**

If any final fix changed code, repeat Tasks 7.1–7.2. Leave the development server running at `http://localhost:3000`, summarize implementation and live-sync counts, list any unsupported sample gaps, and report verification commands accurately.
