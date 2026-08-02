"use client";

import { Disc3, LogOut, Menu, PackageSearch, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const destinations = [
  { href: "/", label: "唱片", icon: Disc3, active: (pathname: string) => pathname === "/" },
  { href: "/orders", label: "订单", icon: PackageSearch, active: (pathname: string) => pathname.startsWith("/orders") }
] as const;

export function ResponsiveNavigation({ signOutAction }: { signOutAction: () => void | Promise<void> }) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!drawerOpen || !dialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [drawerOpen]);

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function finishClosing() {
    setDrawerOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <div className="hidden items-center gap-3 md:flex">
        <nav aria-label="桌面主要导航" className="flex items-center gap-1 rounded-full border border-black/10 bg-white/75 p-1.5">
          {destinations.map((destination) => {
            const Icon = destination.icon;
            const current = destination.active(pathname);
            return (
              <Link
                aria-current={current ? "page" : undefined}
                className={`flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-bold transition ${current ? "bg-[var(--green)] text-white shadow-[0_8px_20px_rgb(34_75_56/0.22)]" : "text-[var(--muted)] hover:bg-white hover:text-[var(--ink)]"}`}
                href={destination.href}
                key={destination.href}
              >
                <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
                <span>{destination.label}</span>
              </Link>
            );
          })}
        </nav>
        <form action={signOutAction}>
          <button aria-label="退出登录" className="grid size-11 place-items-center rounded-full border border-black/10 bg-white/70 transition hover:bg-white" type="submit">
            <LogOut aria-hidden="true" size={18} />
          </button>
        </form>
      </div>

      <button
        aria-expanded={drawerOpen}
        aria-haspopup="dialog"
        aria-label="打开导航菜单"
        className="grid size-11 place-items-center rounded-full border border-black/10 bg-white/80 shadow-sm transition hover:bg-white md:hidden"
        onClick={() => setDrawerOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <Menu aria-hidden="true" size={20} />
      </button>

      <dialog
        aria-labelledby="mobile-navigation-title"
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-[var(--ink)] backdrop:bg-black/35 md:hidden"
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
        onClose={finishClosing}
        ref={dialogRef}
      >
        <aside className="ml-auto flex h-full w-[min(20rem,88vw)] flex-col border-l border-black/10 bg-[var(--surface)] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] shadow-[-24px_0_70px_rgb(23_32_27/0.22)] motion-safe:animate-[drawer-in_220ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Pressed</p>
              <h2 className="mt-1 text-2xl font-semibold" id="mobile-navigation-title">导航菜单</h2>
            </div>
            <button aria-label="关闭导航菜单" className="grid size-11 place-items-center rounded-full border border-[var(--line)] bg-white" onClick={closeDrawer} type="button">
              <X aria-hidden="true" size={19} />
            </button>
          </div>

          <nav aria-label="手机主要导航" className="mt-8 space-y-2">
            {destinations.map((destination) => {
              const Icon = destination.icon;
              const current = destination.active(pathname);
              return (
                <Link
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-base font-bold transition ${current ? "bg-[var(--green)] text-white shadow-[0_10px_26px_rgb(34_75_56/0.2)]" : "border border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-white hover:text-[var(--ink)]"}`}
                  href={destination.href}
                  key={destination.href}
                  onClick={closeDrawer}
                >
                  <Icon aria-hidden="true" size={20} strokeWidth={2.1} />
                  <span>{destination.label}</span>
                </Link>
              );
            })}
          </nav>

          <form action={signOutAction} className="mt-auto border-t border-[var(--line)] pt-4">
            <button aria-label="退出登录" className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-base font-bold text-red-700 transition hover:bg-red-50" type="submit">
              <LogOut aria-hidden="true" size={20} />
              <span>退出登录</span>
            </button>
          </form>
        </aside>
      </dialog>
    </>
  );
}
