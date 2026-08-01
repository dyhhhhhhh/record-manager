"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncMailButton({ lastSyncedAt }: { lastSyncedAt?: string | null }) {
  const router = useRouter();
  const [pendingMode, setPendingMode] = useState<"incremental" | "full" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function synchronize(mode: "incremental" | "full") {
    setPendingMode(mode);
    setMessage(null);
    try {
      const endpoint = mode === "full" ? "/api/mail/sync?mode=full" : "/api/mail/sync";
      const response = await fetch(endpoint, { method: "POST" });
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
      setPendingMode(null);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <div className="grid w-full grid-cols-2 items-start gap-2 sm:flex sm:w-auto sm:justify-end">
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-3 text-xs font-semibold disabled:cursor-wait disabled:opacity-60 sm:h-11 sm:rounded-full sm:px-5 sm:text-sm"
          disabled={pendingMode !== null}
          onClick={() => synchronize("full")}
          type="button"
        >
          <RefreshCw className={pendingMode === "full" ? "animate-spin" : ""} size={16} />
          {pendingMode === "full" ? "正在重新扫描" : "重新扫描近一年"}
        </button>
        <div className="flex min-w-0 flex-col items-stretch gap-1.5 sm:items-end">
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--green)] px-3 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60 sm:h-11 sm:rounded-full sm:px-5 sm:text-sm"
            disabled={pendingMode !== null}
            onClick={() => synchronize("incremental")}
            type="button"
          >
            <RefreshCw className={pendingMode === "incremental" ? "animate-spin" : ""} size={16} />
            {pendingMode === "incremental" ? "正在同步" : "同步新邮件"}
          </button>
          <p className="text-center text-[10px] text-[var(--muted)] sm:text-right sm:text-[11px]">
            {lastSyncedAt ? `上次同步：${lastSyncedAt}` : "尚未同步"}
          </p>
        </div>
      </div>
      {message ? <p className="max-w-xs text-left text-xs text-[var(--muted)] sm:text-right">{message}</p> : null}
    </div>
  );
}
