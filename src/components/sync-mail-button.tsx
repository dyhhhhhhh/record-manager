"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CustomSelect, type CustomSelectOption } from "@/components/custom-select";
import type { MailSyncRange } from "@/features/mail/mail-sync";

const RANGE_OPTIONS = [
  { value: "since_last", label: "上一次扫描之后", tone: "neutral" },
  { value: "1m", label: "1 个月", tone: "blue" },
  { value: "3m", label: "3 个月", tone: "blue" },
  { value: "6m", label: "6 个月", tone: "teal" },
  { value: "1y", label: "1 年", tone: "green" }
] as const satisfies readonly CustomSelectOption[];

export function SyncMailButton({ lastSyncedAt }: { lastSyncedAt?: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function synchronize(range: MailSyncRange) {
    setPending(true);
    setMessage(null);
    try {
      const endpoint = `/api/mail/sync?range=${range}`;
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
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <form
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:flex sm:w-auto sm:justify-end"
        onSubmit={(event) => {
          event.preventDefault();
          const range = new FormData(event.currentTarget).get("range") as MailSyncRange;
          void synchronize(range);
        }}
      >
        <CustomSelect
          ariaLabel="同步时间范围"
          className="min-w-0 sm:w-56"
          defaultValue="since_last"
          disabled={pending}
          name="range"
          options={RANGE_OPTIONS}
        />
        <button
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--green)] px-4 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 sm:px-5"
          disabled={pending}
          type="submit"
        >
          <RefreshCw className={pending ? "animate-spin" : ""} size={16} />
          {pending ? "正在同步" : "同步邮件"}
        </button>
      </form>
      <p className="text-center text-[10px] text-[var(--muted)] sm:text-right sm:text-[11px]">
        {lastSyncedAt ? `上次同步：${lastSyncedAt}` : "尚未同步"}
      </p>
      {message ? <p className="max-w-xs text-left text-xs text-[var(--muted)] sm:text-right">{message}</p> : null}
    </div>
  );
}
