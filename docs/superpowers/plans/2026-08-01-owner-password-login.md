# Owner Password Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for inline execution. Project rules prohibit subagents and delegated implementation.

**Goal:** Replace Magic Link authentication with a single-owner username/password login backed by Supabase Auth, plus a safe local password initialization command.

**Architecture:** `OWNER_USERNAME` is a public-to-the-owner login alias that maps server-side to `OWNER_EMAIL`; Supabase continues to authenticate the email/password pair and issue SSR cookie sessions used by the existing RLS. A local interactive Admin API command creates or updates the owner user and binds `app_owner` without storing the password anywhere outside Supabase Auth.

**Tech Stack:** Next.js 16 App Router Server Actions, TypeScript, Supabase Auth/Admin API, Zod, Vitest, Playwright, Node.js 22 native TypeScript stripping.

## Global Constraints

- 使用中文回答，不得创建、调用或委派任何子代理。
- Passwords must not be written to source files, `.env.local`, Vercel variables, logs, or business tables.
- The password entered in chat must not be used; initialization requires a new password entered privately in the local terminal.
- Preserve Supabase SSR sessions, `auth.uid()`-based RLS, `OWNER_EMAIL`, `app_owner`, and sign-out behavior.
- Username comparison is `trim().toLocaleLowerCase()` and all credential failures use the same user-facing message.
- The setup password is at least 12 characters and must be entered twice.
- Before every commit, review all staged, unstaged, and untracked changes; fix findings and repeat until none remain.

---

## File Structure

- `src/lib/env.ts`: validates `OWNER_USERNAME` with the server environment.
- `src/features/auth/owner.ts`: contains normalized owner email and username guards.
- `src/features/auth/password-policy.ts`: pure password initialization validation shared by CLI and tests.
- `src/features/auth/owner-setup.ts`: testable owner provisioning workflow over structural Admin API interfaces.
- `scripts/set-owner-password.ts`: TTY-only hidden password prompt and Supabase Admin client entrypoint.
- `src/features/auth/password-login.ts`: testable password authentication and owner bootstrap workflow.
- `src/features/auth/actions.ts`: thin redirecting Server Action around the password workflow.
- `src/app/login/page.tsx`: username/password form and safe error copy.
- `src/app/auth/callback/route.ts`: removed because Magic Link is removed.
- `.env.example`, `package.json`, `README.md`, `tests/e2e/login.spec.ts`: configuration, command, documentation, and smoke coverage.

---

### Task 1: Owner username and password policy

**Files:**
- Modify: `.env.example`
- Modify securely without printing values: `.env.local` (ignored; add `OWNER_USERNAME=daiyingheng` only)
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`
- Modify: `src/features/auth/owner.ts`
- Modify: `src/features/auth/owner.test.ts`
- Create: `src/features/auth/password-policy.ts`
- Create: `src/features/auth/password-policy.test.ts`

**Interfaces:**
- Produces: `isOwnerUsername(candidate: string, configuredOwner: string): boolean`
- Produces: `validateOwnerPassword(password: string, confirmation: string): { ok: true } | { ok: false; reason: "too-short" | "mismatch" }`
- Produces: `ServerEnv.OWNER_USERNAME: string`

- [ ] **Step 1: Write failing environment, username, and password-policy tests**

```ts
expect(parseServerEnv({ ...validServerEnv, OWNER_USERNAME: "daiyingheng" }).OWNER_USERNAME).toBe("daiyingheng");
expect(isOwnerUsername(" DaiYingHeng ", "daiyingheng")).toBe(true);
expect(validateOwnerPassword("short", "short")).toEqual({ ok: false, reason: "too-short" });
expect(validateOwnerPassword("a-secure-password", "different-password")).toEqual({ ok: false, reason: "mismatch" });
expect(validateOwnerPassword("a-secure-password", "a-secure-password")).toEqual({ ok: true });
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm vitest run src/lib/env.test.ts src/features/auth/owner.test.ts src/features/auth/password-policy.test.ts`

Expected: FAIL because `OWNER_USERNAME`, `isOwnerUsername`, and `validateOwnerPassword` do not exist.

- [ ] **Step 3: Implement the minimal guards and schema**

```ts
export function isOwnerUsername(candidate: string, configuredOwner: string) {
  return candidate.trim().toLocaleLowerCase() === configuredOwner.trim().toLocaleLowerCase();
}

export function validateOwnerPassword(password: string, confirmation: string) {
  if (password.length < 12) return { ok: false, reason: "too-short" } as const;
  if (password !== confirmation) return { ok: false, reason: "mismatch" } as const;
  return { ok: true } as const;
}
```

Add `OWNER_USERNAME: z.string().trim().min(1)` to `serverEnvSchema`, `getServerEnv()`, `.env.example`, and all valid server-env fixtures.

Securely append `OWNER_USERNAME=daiyingheng` to `.env.local` without reading or printing its existing values. Restart the current development server after this environment change. Never stage `.env.local`.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `pnpm vitest run src/lib/env.test.ts src/features/auth/owner.test.ts src/features/auth/password-policy.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Review all pending changes and commit**

Run: `git diff --check && git status --short && git diff -- .env.example src/lib/env.ts src/lib/env.test.ts src/features/auth/owner.ts src/features/auth/owner.test.ts src/features/auth/password-policy.ts src/features/auth/password-policy.test.ts`

Fix every actionable issue, rerun focused tests, then commit:

```bash
git add .env.example src/lib/env.ts src/lib/env.test.ts src/features/auth/owner.ts src/features/auth/owner.test.ts src/features/auth/password-policy.ts src/features/auth/password-policy.test.ts
git commit -m "feat: add owner username configuration"
```

---

### Task 2: Local owner password initialization command

**Files:**
- Create: `src/features/auth/owner-setup.ts`
- Create: `src/features/auth/owner-setup.test.ts`
- Create: `scripts/set-owner-password.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `validateOwnerPassword(password, confirmation)` from Task 1.
- Produces: `provisionOwnerPassword(input, dependencies): Promise<{ ok: true; created: boolean } | { ok: false; reason: "auth-admin" | "owner-binding" }>`
- Produces: `pnpm owner:set-password`, executed as `node --env-file=.env.local scripts/set-owner-password.ts`.

- [ ] **Step 1: Write failing owner-provisioning tests**

Use structural mocks for `listUsers`, `createUser`, `updateUserById`, and `app_owner.upsert`:

```ts
it("updates an existing matching owner and binds app_owner", async () => {
  const result = await provisionOwnerPassword(
    { email: "owner@example.com", password: "a-secure-password" },
    fakeAdminWithExistingOwner()
  );
  expect(result).toEqual({ ok: true, created: false });
  expect(updateUserById).toHaveBeenCalledWith("owner-id", { password: "a-secure-password", email_confirm: true });
  expect(upsertOwner).toHaveBeenCalledWith(
    { singleton: true, user_id: "owner-id", email: "owner@example.com" },
    { onConflict: "singleton" }
  );
});
```

Also cover creating an absent user, Admin API failure, and owner binding failure.

- [ ] **Step 2: Run the provisioning test and confirm RED**

Run: `pnpm vitest run src/features/auth/owner-setup.test.ts`

Expected: FAIL because `provisionOwnerPassword` does not exist.

- [ ] **Step 3: Implement owner provisioning**

`provisionOwnerPassword` must:

```ts
const normalizedEmail = email.trim().toLocaleLowerCase();
const existing = users.find((user) => user.email?.trim().toLocaleLowerCase() === normalizedEmail);
const authResult = existing
  ? await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
  : await admin.auth.admin.createUser({ email: normalizedEmail, password, email_confirm: true });
```

After a successful auth operation, upsert `app_owner` by singleton. Return only typed reasons and never include raw errors or credentials.

- [ ] **Step 4: Implement the hidden TTY command**

The script must refuse non-TTY input, use `readline.emitKeypressEvents(stdin)` with raw mode, print `*` for regular characters, support backspace and Ctrl-C, restore raw mode in `finally`, validate both entries, create the Supabase Admin client, and call `provisionOwnerPassword`.

Use this prompt boundary so secrets never enter command history or normal logs:

```ts
async function promptHidden(label: string) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("interactive-terminal-required");
  emitKeypressEvents(stdin);
  const previousRawMode = stdin.isRaw;
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";

  try {
    return await new Promise<string>((resolve, reject) => {
      const onKeypress = (text: string, key: { name?: string; ctrl?: boolean; meta?: boolean }) => {
        if (key.ctrl && key.name === "c") {
          stdin.off("keypress", onKeypress);
          reject(new Error("cancelled"));
          return;
        }
        if (key.name === "return") {
          stdin.off("keypress", onKeypress);
          resolve(value);
          return;
        }
        if (key.name === "backspace") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          return;
        }
        if (!key.ctrl && !key.meta && text) {
          value += text;
          stdout.write("*");
        }
      };
      stdin.on("keypress", onKeypress);
    });
  } finally {
    stdin.setRawMode(previousRawMode);
    stdin.pause();
    stdout.write("\n");
  }
}
```

Tests and manual cancellation must confirm that raw mode is restored.

Add this package script:

```json
"owner:set-password": "node --env-file=.env.local scripts/set-owner-password.ts"
```

- [ ] **Step 5: Run tests and non-TTY safety check**

Run: `pnpm vitest run src/features/auth/password-policy.test.ts src/features/auth/owner-setup.test.ts`

Expected: all tests pass.

Run: `pnpm owner:set-password </dev/null`

Expected: exits non-zero with a safe message that a local interactive terminal is required, without printing configuration values.

- [ ] **Step 6: Review all pending changes and commit**

Run: `git diff --check && git status --short && git diff -- src/features/auth/owner-setup.ts src/features/auth/owner-setup.test.ts scripts/set-owner-password.ts package.json`

Fix every finding, rerun Task 2 verification, then commit:

```bash
git add src/features/auth/owner-setup.ts src/features/auth/owner-setup.test.ts scripts/set-owner-password.ts package.json
git commit -m "feat: add owner password setup command"
```

---

### Task 3: Password authentication workflow and login page

**Files:**
- Create: `src/features/auth/password-login.ts`
- Create: `src/features/auth/password-login.test.ts`
- Modify: `src/features/auth/actions.ts`
- Modify: `src/app/login/page.tsx`
- Delete: `src/app/auth/callback/route.ts`
- Modify: `tests/e2e/login.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: `isOwnerEmail` and `isOwnerUsername` from `owner.ts`.
- Produces: `authenticateOwnerPassword(input, dependencies): Promise<"success" | "invalid-credentials" | "system-error">`
- Produces: `signInWithPassword(formData: FormData): Promise<never>` Server Action.

- [ ] **Step 1: Write failing password-login workflow tests**

Cover all required outcomes with structural Supabase mocks:

```ts
expect(await authenticateOwnerPassword(validInput, validDependencies)).toBe("success");
expect(await authenticateOwnerPassword({ ...validInput, username: "visitor" }, validDependencies)).toBe("invalid-credentials");
expect(await authenticateOwnerPassword(validInput, dependenciesWithAuthError)).toBe("invalid-credentials");
expect(await authenticateOwnerPassword(validInput, dependenciesWithWrongReturnedEmail)).toBe("invalid-credentials");
expect(await authenticateOwnerPassword(validInput, dependenciesWithBindingError)).toBe("system-error");
```

Assert that wrong usernames never call Supabase and that successful credentials use `OWNER_EMAIL` rather than the submitted username.

- [ ] **Step 2: Run the password-login test and confirm RED**

Run: `pnpm vitest run src/features/auth/password-login.test.ts`

Expected: FAIL because `authenticateOwnerPassword` does not exist.

- [ ] **Step 3: Implement the testable workflow**

```ts
if (!isOwnerUsername(input.username, input.ownerUsername)) return "invalid-credentials";
const { data, error } = await auth.auth.signInWithPassword({ email: input.ownerEmail, password: input.password });
if (error || !data.user?.email || !isOwnerEmail(data.user.email, input.ownerEmail)) {
  await auth.auth.signOut();
  return "invalid-credentials";
}
const { error: bindingError } = await admin.from("app_owner").upsert(
  { singleton: true, user_id: data.user.id, email: data.user.email.toLocaleLowerCase() },
  { onConflict: "singleton" }
);
if (bindingError) {
  await auth.auth.signOut();
  return "system-error";
}
return "success";
```

- [ ] **Step 4: Replace the Server Action and page**

The action reads `username` and `password`, calls the workflow, redirects success to `/`, invalid credentials to `/login?error=invalid-credentials`, and system errors to `/login?error=system`.

The page always renders:

```tsx
<input id="username" name="username" autoComplete="username" required />
<input id="password" name="password" type="password" autoComplete="current-password" required />
<button type="submit">登录</button>
```

Render “账号或密码错误” only for `invalid-credentials`; use “登录服务暂时不可用” for `system`. Remove OTP copy and `sent` handling. Delete the callback route.

Add `OWNER_USERNAME: "owner"` to the Playwright web-server environment so isolated test runs can parse the complete server configuration.

- [ ] **Step 5: Update and run the login E2E smoke test**

Update the test to assert labels “账号” and “密码” plus button “登录”, then run:

Run: `pnpm playwright test tests/e2e/login.spec.ts`

Expected: 1 test passes.

- [ ] **Step 6: Run focused auth tests**

Run: `pnpm vitest run src/features/auth/owner.test.ts src/features/auth/password-login.test.ts`

Expected: all focused tests pass.

- [ ] **Step 7: Review all pending changes and commit**

Run: `git diff --check && git status --short && git diff -- src/features/auth/password-login.ts src/features/auth/password-login.test.ts src/features/auth/actions.ts src/app/login/page.tsx src/app/auth/callback/route.ts tests/e2e/login.spec.ts playwright.config.ts`

Fix every finding and rerun Task 3 verification, then commit:

```bash
git add src/features/auth/password-login.ts src/features/auth/password-login.test.ts src/features/auth/actions.ts src/app/login/page.tsx src/app/auth/callback/route.ts tests/e2e/login.spec.ts playwright.config.ts
git commit -m "feat: replace magic link with password login"
```

---

### Task 4: Documentation, complete verification, and owner handoff

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `pnpm owner:set-password` and the password login page from earlier tasks.
- Produces: documented local and Vercel setup flow with no Magic Link dependency.

- [ ] **Step 1: Update documentation**

Replace OTP instructions with:

```md
1. Configure `OWNER_USERNAME` and `OWNER_EMAIL`.
2. Run `pnpm owner:set-password` and privately enter a new password twice.
3. Disable “Allow new users to sign up” in Supabase.
4. Open `/login` and sign in with the configured username and password.
```

- [ ] **Step 2: Run the complete automated verification suite**

Run:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm playwright test tests/e2e/login.spec.ts
pnpm audit --audit-level=high
```

Expected: zero test failures, zero lint/type errors, successful production build, login smoke pass, and no high-severity audit findings.

- [ ] **Step 3: Perform full-branch and pending-change review**

Review every changed file and the full branch diff:

```bash
git status --short
git diff --check
git diff
git diff 7e512c1..HEAD
```

Check authentication correctness, credential leakage, safe error mapping, CLI raw-mode cleanup, documentation accuracy, dead Magic Link references, and test coverage. Fix every actionable issue, rerun the complete suite, and repeat review until no issue remains.

- [ ] **Step 4: Commit documentation after a clean review**

```bash
git add README.md
git commit -m "docs: document owner password login"
```

Do not stage `.env.local` because it is ignored and contains secrets.

- [ ] **Step 5: Hand off the private initialization action**

Ask the user to run `pnpm owner:set-password` in `/Users/dyh/record-manager`, enter a new password privately twice, and report only whether the command succeeded. Do not request or accept the password in chat.
