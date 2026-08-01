import { Disc3 } from "lucide-react";

import { signInWithPassword } from "@/features/auth/actions";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorMessage =
    error === "invalid-credentials"
      ? "账号或密码错误"
      : error === "system"
        ? "登录服务暂时不可用"
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[0_24px_80px_rgb(23_32_27/0.12)] sm:p-10">
        <div className="mb-10 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-[var(--green)] text-white">
            <Disc3 aria-hidden="true" size={23} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent)]">Pressed</p>
            <h1 className="text-2xl font-semibold tracking-tight">你的唱片订单簿</h1>
          </div>
        </div>

        <p className="mb-7 leading-7 text-[var(--muted)]">使用已配置的所有者账号登录。</p>

        <form action={signInWithPassword} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="username">账号</label>
            <input
              className="h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 outline-none transition focus:border-[var(--green)] focus:ring-4 focus:ring-emerald-900/10"
              id="username"
              name="username"
              autoComplete="username"
              required
              placeholder="请输入账号"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold" htmlFor="password">密码</label>
            <input
              className="h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 outline-none transition focus:border-[var(--green)] focus:ring-4 focus:ring-emerald-900/10"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="请输入密码"
            />
          </div>
          {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
          <button className="h-12 w-full rounded-xl bg-[var(--green)] font-semibold text-white transition hover:bg-[#173b2b]" type="submit">
            登录
          </button>
        </form>
      </section>
    </main>
  );
}
