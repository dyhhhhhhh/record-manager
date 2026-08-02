import { NextResponse } from "next/server";

import { requireOwner } from "@/features/auth/require-owner";
import { runOwnerMailSync } from "@/features/mail/run-sync";
import type { MailSyncRange } from "@/features/mail/mail-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

const RANGES = new Set<MailSyncRange>(["since_last", "1m", "3m", "6m", "1y"]);

export async function POST(request: Request) {
  const user = await requireOwner();
  const searchParams = new URL(request.url).searchParams;
  const requestedRange = searchParams.get("range") as MailSyncRange | null;
  const selection = searchParams.get("mode") === "full"
    ? "full"
    : requestedRange && RANGES.has(requestedRange) ? requestedRange : "since_last";
  try {
    return NextResponse.json(await runOwnerMailSync(user.id, selection));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "邮箱同步失败" },
      { status: 502 }
    );
  }
}
