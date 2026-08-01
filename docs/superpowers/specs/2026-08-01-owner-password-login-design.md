# 单用户账号密码登录设计

## 目标

把现有 Supabase Magic Link 登录改为单用户账号密码登录，消除邮件链接、浏览器 PKCE 状态和回调页面的依赖。继续使用 Supabase Auth 维护会话，并保留 `OWNER_EMAIL` 白名单、`app_owner` 唯一绑定和现有 RLS。

## 选定方案

新增 `OWNER_USERNAME` 环境变量。登录页接收用户名和密码；服务端先以不区分大小写的方式校验用户名，再使用环境变量中的 `OWNER_EMAIL` 和用户提交的密码调用 Supabase `signInWithPassword`。因此浏览器和客户端永远不需要知道所有者邮箱，Supabase 仍以邮箱作为真实认证标识。

密码只保存在 Supabase Auth。代码、`.env.local`、Vercel 环境变量、日志和数据库业务表都不保存密码。

不采用以下方案：

- 邮箱加密码：实现最少，但不满足独立登录账号的要求。
- 自建用户名密码与会话：会绕开 Supabase Auth，并破坏当前依赖 `auth.uid()` 的 RLS 设计。

## 首次初始化与密码重置

新增 `pnpm owner:set-password` 本地命令：

1. 从 `.env.local` 读取 Supabase URL、Secret key、`OWNER_EMAIL` 和 `OWNER_USERNAME`。
2. 在终端隐藏输入新密码并要求再次确认；密码至少 12 个字符。
3. 通过 Supabase Admin API 查找 `OWNER_EMAIL` 对应用户；存在则更新密码，不存在则创建并确认邮箱。
4. 将该用户幂等写入 `app_owner` 的唯一记录。
5. 只输出成功或脱敏错误，不回显密码、邮箱或密钥。

同一命令也用于以后忘记密码时的本地重置。应用本身不提供注册、忘记密码或修改密码页面，避免为个人工具增加公开的账号恢复入口。完成初始化后可以关闭 Supabase 的“Allow new users to sign up”。

## 登录与会话流程

登录 Server Action 执行以下步骤：

1. 读取并规范化用户名和密码。
2. 用户名必须与 `OWNER_USERNAME` 匹配；不匹配时返回统一的凭据错误。
3. 调用 Supabase `signInWithPassword({ email: OWNER_EMAIL, password })`。
4. 验证返回用户的邮箱仍与 `OWNER_EMAIL` 匹配。
5. 幂等确认 `app_owner` 绑定，然后跳转首页。

现有 Supabase SSR cookie 会话、代理刷新、`requireOwner`、退出登录及全部 RLS 保持不变。删除 Magic Link 请求逻辑和 `/auth/callback` 路由。

## 页面与错误处理

登录页显示“账号”和“密码”字段，账号允许浏览器记忆为 username，密码使用 `current-password`。不再显示发送成功状态。

用户名不存在、密码错误、Supabase 拒绝登录时统一显示“账号或密码错误”，避免泄露账号状态。服务配置或 owner 绑定失败使用单独的通用系统错误，但不把 Supabase 原始错误展示给用户。

## 配置与文档

- `.env.example` 增加 `OWNER_USERNAME`。
- 本地 `.env.local` 增加已确定的用户名；密码不写入该文件。
- Vercel 后续需要配置同名 `OWNER_USERNAME`。
- README 改为密码登录、初始化命令和关闭注册的步骤。

## 测试与验收

- 单元测试覆盖用户名规范化与匹配、密码长度校验和密码确认不一致。
- 登录行为测试覆盖正确凭据、错误用户名、错误密码、非 owner 用户和 owner 绑定失败。
- Playwright 登录页测试改为账号密码表单，不再查找 Magic Link 按钮。
- 运行 Vitest、ESLint、TypeScript、生产构建和 Playwright 登录页烟雾测试。
- 本地执行初始化命令后，使用新密码登录并确认 `app_owner` 已绑定；确认 Supabase 注册关闭后已有 owner 仍可登录。

## 范围外

- 多用户、用户自助注册、邮件找回密码和页面内修改密码。
- 自建密码哈希、会话系统或额外身份服务。
- 把密码放入环境变量或代码。
