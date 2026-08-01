# iMusic 邮件订单管理工具 V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个从 QQ 邮箱导入 iMusic 下单、发货和取消邮件，并以唱片为中心管理订单、金额及状态的个人工具。

**Architecture:** Next.js App Router 部署到 Vercel，Node.js Route Handler 负责 QQ IMAP 同步与邮件解析；Supabase 提供 OTP、Postgres、RLS 和私有封面存储。邮件先成为待处理事件，只有用户确认后才创建订单或改变状态。

**Tech Stack:** TypeScript, Next.js, Tailwind CSS, Supabase, imapflow, mailparser, Zod, Vitest, Testing Library, Playwright

## Global Constraints

- V1 仅支持 iMusic，单用户，首次扫描最近一年。
- 金额保留原始币种并分别统计，不做汇率换算。
- 邮件正文不得落库；只保存邮件元数据和结构化解析结果。
- 下单、发货、取消邮件产生待处理事件，所有业务变化必须由用户确认。
- 履约状态为 ordered、shipped、received；整单和单项取消独立、可恢复。
- 封面复制到 Supabase 私有 Storage；只接收 JPEG、PNG、WebP，最大 5 MB。

---

### Task 1: Project foundation and authenticated shell

- [ ] Scaffold Next.js App Router, TypeScript, Tailwind, Vitest and Playwright configuration.
- [ ] Add environment validation and Supabase browser/server/admin clients.
- [ ] Implement owner-only email OTP login, callback bootstrap and authenticated navigation shell.
- [ ] Verify unit tests, typecheck and production build.

### Task 2: Supabase schema, RLS and typed domain model

- [ ] Add migrations for app_owner, orders, order_items, mail_events, mail_sync_state and mail_sync_runs.
- [ ] Add enum/check constraints, unique keys, sync lock RPCs, RLS policies and private album-covers bucket policies.
- [ ] Add TypeScript domain and parser contracts plus database test coverage.
- [ ] Verify database/type tests.

### Task 3: iMusic parser and QQ IMAP synchronization

- [ ] Write failing classifier/parser tests with sanitized structural EML fixtures for order, shipment, cancellation and marketing mail.
- [ ] Implement iMusic classification and structured parsing behind a parser interface.
- [ ] Implement header-first IMAP sync, BODY.PEEK fetch, one-year initial scan, UID cursor, deduplication, partial failure handling and atomic locking.
- [ ] Add authenticated manual and CRON endpoints; verify sync tests.

### Task 4: Inbox confirmation and image ingestion

- [ ] Implement pending event queries and editable order confirmation flow.
- [ ] Implement shipment/cancellation association, apply/ignore actions and missing-order handling.
- [ ] Download validated covers into private Supabase Storage with placeholder fallback.
- [ ] Verify action and component tests.

### Task 5: Record home, orders and status management

- [ ] Implement record-card home with per-currency stats, search and 24-item pagination.
- [ ] Implement order list/detail search, filters, editing and fulfillment transitions.
- [ ] Implement order/item cancel and restore with adjusted total requirements.
- [ ] Verify business-rule, component and page tests.

### Task 6: End-to-end verification and deployment readiness

- [ ] Add Playwright coverage for login, sync, confirmation, search, shipment, receive, cancel and restore flows.
- [ ] Add Vercel daily cron, deployment documentation, sample env and operational error states.
- [ ] Run full tests, lint, typecheck and production build; verify no raw email body is persisted.
