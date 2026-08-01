"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncMailButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function synchronize() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mail/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "同步失败");
      setMessage(
        result.status === "already_running"
          ? "已有同步正在运行"
          : `已扫描 ${result.scannedCount} 封，匹配 ${result.matchedCount} 封订单邮件，${result.failedCount} 封解析失败`
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--green)] px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={synchronize}
        type="button"
      >
        <RefreshCw className={pending ? "animate-spin" : ""} size={16} />
        {pending ? "正在同步" : "同步 QQ 邮箱"}
      </button>
      {message ? <p className="max-w-xs text-right text-xs text-[var(--muted)]">{message}</p> : null}
    </div>
  );
}
