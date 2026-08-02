import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "supabase/migrations/202608010001_initial_schema.sql");
const workflowPath = join(process.cwd(), "supabase/migrations/202608010002_event_workflows.sql");
const hardeningPath = join(process.cwd(), "supabase/migrations/202608010003_sync_lock_hardening.sql");
const unifiedOrdersPath = join(process.cwd(), "supabase/migrations/202608010004_unified_orders.sql");
const statusRaceHardeningPath = join(process.cwd(), "supabase/migrations/202608010005_status_race_hardening.sql");
const hmvSupportPath = join(process.cwd(), "supabase/migrations/202608020001_hmv_mail_support.sql");
const independentStoreSupportPath = join(process.cwd(), "supabase/migrations/202608020002_independent_store_mail_support.sql");

describe("initial database migration", () => {
  it("creates every required table with row level security", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const tables = ["app_owner", "orders", "order_items", "mail_events", "mail_sync_state", "mail_sync_runs"];

    for (const table of tables) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("never adds a raw email body column", () => {
    const sql = readFileSync(migrationPath, "utf8").toLocaleLowerCase();
    expect(sql).not.toMatch(/raw_(body|email)|email_(body|html)|body_html/);
  });

  it("defines sync locking and private cover storage", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("public.try_start_mail_sync");
    expect(sql).toContain("unique index one_running_mail_sync_per_owner");
    expect(sql).toContain("'album-covers', 'album-covers', false");
  });

  it("keeps event application atomic in database functions", () => {
    const sql = readFileSync(workflowPath, "utf8");
    expect(sql).toContain("public.confirm_order_event");
    expect(sql).toContain("public.apply_shipment_event");
    expect(sql).toContain("public.apply_cancellation_event");
    expect(sql).toContain("public.set_order_item_cancellation");
    expect(sql).toContain("jsonb_array_elements(p_items)");
  });

  it("expires stale sync locks and restricts authenticated callers to the app owner", () => {
    const sql = readFileSync(hardeningPath, "utf8");
    expect(sql).toContain("started_at < now() - interval '10 minutes'");
    expect(sql).toContain("not public.is_app_owner()");
  });

  it("adds fee breakdown columns and automatic status application", () => {
    const sql = readFileSync(unifiedOrdersPath, "utf8");
    expect(sql).toContain("items_subtotal numeric(14, 2)");
    expect(sql).toContain("shipping_total numeric(14, 2)");
    expect(sql).toContain("tax_total numeric(14, 2)");
    expect(sql).toContain("public.apply_mail_event_status");
    expect(sql).toContain("public.update_order_details");
    expect(sql).toContain("fulfillment_status = 'ordered'");
  });

  it("serializes imports with automatic shipment and cancellation handling", () => {
    const sql = readFileSync(statusRaceHardeningPath, "utf8");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("if not found then return false");
    expect(sql).toContain("if event_row.status = 'applied' then return true");
    expect(sql).toContain("set external_order_id = trim(p_external_order_id)");
  });

  it("adds merchant-aware HMV orders, discounts and UUID status results", () => {
    const sql = readFileSync(hmvSupportPath, "utf8");
    const initialSql = readFileSync(migrationPath, "utf8");
    expect(initialSql).toContain("unique (user_id, merchant, external_order_id)");
    expect(sql).toContain("add column merchant text not null default 'imusic'");
    expect(sql).toContain("discount_total numeric(14, 2) not null default 0");
    expect(sql).toContain("event_row.merchant");
    expect(sql).toContain("returns uuid");
    expect(sql).toContain("p_discount_total");
    expect(sql).toContain("merchant = event_row.merchant");
    expect(sql).toContain("cancellation.merchant = event_row.merchant");
    expect(sql).toContain("owner_id::text || ':' || event_row.merchant || ':'");
    expect(sql).toContain("if not found then return null");
    expect(sql).toContain("when fulfillment_status = 'ordered' and cancelled_at is null then 'shipped'");
    expect(sql).toContain("set cancelled_at = coalesce(cancelled_at, event_row.received_at)");
    expect(sql).toContain("sum((entry->>'unitPrice')::numeric * coalesce((entry->>'quantity')::integer, 1))");
  });

  it("extends order and mail-event merchant constraints to all five merchants", () => {
    const sql = readFileSync(independentStoreSupportPath, "utf8");
    expect(sql).toMatch(/'mutant'.*'black_screen'.*'laced'/s);
    expect(sql).toContain("alter table public.mail_events");
    expect(sql).toContain("alter table public.orders");
  });
});
