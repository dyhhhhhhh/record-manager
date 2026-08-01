# Pressed · iMusic 唱片订单簿

Pressed 是一个个人唱片订单工具：从 QQ 邮箱读取 iMusic 的下单、发货和取消邮件，经过人工确认后生成订单，以唱片封面网格展示有效购买，并按原始币种统计真实实付。

## 功能

- 只读取最近一年及之后新增的 iMusic 邮件，不改变邮件已读状态。
- 下单、发货、取消邮件均进入待处理页，不自动改变业务数据。
- 首页按唱片搜索和展示；取消的订单或单项立即隐藏，恢复后重新出现。
- 订单支持未发货、已发货、已收到状态，以及整单/单项取消与恢复。
- 多币种分别统计；部分取消或恢复时手动填写调整后的实付总额。
- 封面复制到 Supabase 私有 Storage；数据库不保存原始邮件正文。

## 本地启动

要求 Node.js 22+、pnpm 10+ 和一个 Supabase 项目。

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

将 `supabase/migrations` 中的迁移按顺序应用到 Supabase：

```bash
supabase link --project-ref <project-ref>
supabase db push
```

如果本机没有 Supabase CLI，也可以在 Supabase SQL Editor 中按文件名顺序执行所有迁移文件。

## Supabase 配置

1. 在 Authentication 中开启 Email OTP。
2. 在邮件模板中保留确认链接，使其回调到 `https://你的域名/auth/callback`。
3. 将本地和 Vercel 域名加入 Auth URL Allow List。
4. 迁移会创建唯一所有者绑定、RLS、同步锁和私有 `album-covers` bucket。
5. 首位与 `OWNER_EMAIL` 匹配并成功回调的用户会被绑定为唯一 owner。

## QQ 邮箱配置

在 QQ 邮箱网页版进入“设置 → 账户”，开启 IMAP/SMTP 并生成授权码。授权码不是 QQ 密码。

服务端使用：

```text
imap.qq.com:993 (TLS)
```

所需环境变量见 [.env.example](./.env.example)。`SUPABASE_SECRET_KEY`、`QQ_IMAP_AUTH_CODE` 和 `CRON_SECRET` 只能配置在服务端。

## Vercel 部署

1. 导入仓库并配置 `.env.example` 中的全部变量。
2. 选择与 Supabase 相近的 Function 区域。
3. 部署后先完成一次 owner OTP 登录，再测试手动邮箱同步。
4. `vercel.json` 每天 UTC 02:00（北京时间 10:00 左右）调用一次同步接口。
5. Vercel 会把 `CRON_SECRET` 自动作为 Bearer Token 发送；同步接口会进行恒定时间比较。

## 验证

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```

默认 Playwright 只运行登录页冒烟测试。要在部署环境验证完整页面，设置：

```text
PLAYWRIGHT_BASE_URL=https://你的域名
E2E_AUTH_STORAGE=/absolute/path/to/auth-storage.json
E2E_EVENT_ID=<预置待处理事件 ID，可选>
E2E_ORDER_ID=<预置订单 ID，可选>
```

测试夹具位于 `src/features/mail/fixtures`，与真实 iMusic 邮件结构一致，但已移除姓名、地址、真实订单号和追踪信息。
