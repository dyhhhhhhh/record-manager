import { Disc3, LogOut, PackageSearch } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/features/auth/actions";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[var(--paper)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid size-10 place-items-center rounded-full bg-[var(--green)] text-white"><Disc3 size={21} /></span>
            <span>
              <strong className="block leading-none">Pressed</strong>
              <small className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">record ledger</small>
            </span>
          </Link>
          <nav className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/10 bg-[var(--surface)]/95 p-1 text-sm font-semibold shadow-[0_12px_40px_rgb(23_32_27/0.2)] backdrop-blur-xl sm:static sm:translate-x-0 sm:bg-white/70 sm:shadow-none">
            <Link className="rounded-full px-4 py-2 hover:bg-white" href="/">唱片</Link>
            <Link className="flex items-center gap-2 rounded-full px-4 py-2 hover:bg-white" href="/orders"><PackageSearch size={16} /><span>订单</span></Link>
          </nav>
          <form action={signOut}>
            <button aria-label="退出登录" className="grid size-10 place-items-center rounded-full border border-black/10 bg-white/70 hover:bg-white" type="submit"><LogOut size={17} /></button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-10 pb-28 sm:px-8 sm:pb-10">{children}</main>
    </div>
  );
}
