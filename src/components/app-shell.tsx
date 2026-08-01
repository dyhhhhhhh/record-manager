import { Disc3, LogOut } from "lucide-react";
import Link from "next/link";

import { PrimaryNavigation } from "@/components/primary-navigation";
import { signOut } from "@/features/auth/actions";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-black/10 bg-[var(--paper)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-8 sm:py-4">
          <Link className="flex items-center gap-3" href="/">
            <span className="grid size-10 place-items-center rounded-full bg-[var(--green)] text-white"><Disc3 size={21} /></span>
            <span>
              <strong className="block leading-none">Pressed</strong>
              <small className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">record ledger</small>
            </span>
          </Link>
          <PrimaryNavigation />
          <form action={signOut}>
            <button aria-label="退出登录" className="grid size-10 place-items-center rounded-full border border-black/10 bg-white/70 hover:bg-white" type="submit"><LogOut size={17} /></button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-7 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-10 sm:pb-10">{children}</main>
    </div>
  );
}
