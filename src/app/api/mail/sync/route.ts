import { NextResponse } from "next/server";

import { requireOwner } from "@/features/auth/require-owner";
import { runOwnerMailSync } from "@/features/mail/run-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await requireOwner();
  const mode = new URL(request.url).searchParams.get("mode") === "full" ? "full" : "incremental";
  try {
    return NextResponse.json(await runOwnerMailSync(user.id, mode));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "邮箱同步失败" },
      { status: 502 }
    );
  }
}
