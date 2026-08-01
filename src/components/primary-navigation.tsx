"use client";

import { Disc3, PackageSearch } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", label: "唱片", icon: Disc3, active: (pathname: string) => pathname === "/" },
  { href: "/orders", label: "订单", icon: PackageSearch, active: (pathname: string) => pathname.startsWith("/orders") }
] as const;

export function PrimaryNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="主要导航"
      className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 grid w-[calc(100%_-_1.5rem)] max-w-sm -translate-x-1/2 grid-cols-2 gap-1.5 rounded-[1.35rem] border border-black/10 bg-[var(--surface)]/95 p-1.5 shadow-[0_16px_50px_rgb(23_32_27/0.24)] backdrop-blur-xl sm:static sm:flex sm:w-auto sm:max-w-none sm:translate-x-0 sm:rounded-full sm:bg-white/75 sm:shadow-none"
    >
      {destinations.map((destination) => {
        const Icon = destination.icon;
        const current = destination.active(pathname);
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-bold transition sm:rounded-full sm:px-6 sm:text-base ${current ? "bg-[var(--green)] text-white shadow-[0_8px_20px_rgb(34_75_56/0.22)]" : "text-[var(--muted)] hover:bg-white hover:text-[var(--ink)]"}`}
            href={destination.href}
            key={destination.href}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={2.2} />
            <span>{destination.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
