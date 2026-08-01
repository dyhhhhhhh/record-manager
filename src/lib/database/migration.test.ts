import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "supabase/migrations/202608010001_initial_schema.sql");
const workflowPath = join(process.cwd(), "supabase/migrations/202608010002_event_workflows.sql");

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
});
