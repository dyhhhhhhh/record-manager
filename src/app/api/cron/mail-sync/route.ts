import { NextResponse } from "next/server";

import { isValidCronAuthorization } from "@/features/mail/cron-auth";
import { runOwnerMailSync } from "@/features/mail/run-sync";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const env = getServerEnv();
  if (!isValidCronAuthorization(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: owner, error } = await admin.from("app_owner").select("user_id").eq("singleton", true).single();
  if (error || !owner) {
    return NextResponse.json({ error: "Owner is not initialized" }, { status: 503 });
  }

  try {
    return NextResponse.json(await runOwnerMailSync(owner.user_id));
  } catch (syncError) {
    return NextResponse.json(
      { error: syncError instanceof Error ? syncError.message : "邮箱同步失败" },
      { status: 502 }
    );
  }
}
