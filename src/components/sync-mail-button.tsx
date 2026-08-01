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
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-start justify-end gap-2">
        <button
          className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--line)] bg-white px-5 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
          disabled={pendingMode !== null}
          onClick={() => synchronize("full")}
          type="button"
        >
          <RefreshCw className={pendingMode === "full" ? "animate-spin" : ""} size={16} />
          {pendingMode === "full" ? "正在重新扫描" : "重新扫描近一年"}
        </button>
        <div className="flex flex-col items-end gap-1.5">
          <button
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--green)] px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
            disabled={pendingMode !== null}
            onClick={() => synchronize("incremental")}
            type="button"
          >
            <RefreshCw className={pendingMode === "incremental" ? "animate-spin" : ""} size={16} />
            {pendingMode === "incremental" ? "正在同步" : "同步新邮件"}
          </button>
          <p className="text-right text-[11px] text-[var(--muted)]">
            {lastSyncedAt ? `上次同步：${lastSyncedAt}` : "尚未同步"}
          </p>
        </div>
      </div>
      {message ? <p className="max-w-xs text-right text-xs text-[var(--muted)]">{message}</p> : null}
    </div>
  );
}
