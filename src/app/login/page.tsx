import { Disc3 } from "lucide-react";

import { requestOtp } from "@/features/auth/actions";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const hasError = Boolean(params.error);

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

        <p className="mb-7 leading-7 text-[var(--muted)]">输入已配置的所有者邮箱，我们会发送一次性登录链接。</p>

        {sent ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            登录邮件已发送，请前往邮箱完成验证。
          </div>
        ) : (
          <form action={requestOtp} className="space-y-4">
            <label className="block text-sm font-semibold" htmlFor="email">邮箱地址</label>
            <input
              className="h-12 w-full rounded-xl border border-[var(--line)] bg-white px-4 outline-none transition focus:border-[var(--green)] focus:ring-4 focus:ring-emerald-900/10"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="owner@example.com"
            />
            {hasError ? <p className="text-sm text-red-700">无法发送登录邮件，请确认邮箱和服务配置。</p> : null}
            <button className="h-12 w-full rounded-xl bg-[var(--green)] font-semibold text-white transition hover:bg-[#173b2b]" type="submit">
              获取登录链接
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
