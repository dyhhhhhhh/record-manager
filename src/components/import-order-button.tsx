"use client";

import { Download } from "lucide-react";
import { useFormStatus } from "react-dom";

export function ImportOrderButton({ compact = false }: { compact?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--green)] font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-wait disabled:translate-y-0 disabled:opacity-60 ${compact ? "h-10 px-4 text-sm" : "h-11 px-5"}`}
      disabled={pending}
      type="submit"
    >
      <Download className={pending ? "animate-bounce" : ""} size={16} />
      {pending ? "正在导入" : "导入"}
    </button>
  );
}
