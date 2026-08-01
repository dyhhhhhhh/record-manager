import { NextResponse } from "next/server";

import { isOwnerEmail } from "@/features/auth/owner";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = new URL("/", url.origin);

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing-code", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data.user?.email;

  if (error || !data.user || !email || !isOwnerEmail(email, getServerEnv().OWNER_EMAIL)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=not-owner", url.origin));
  }

  const admin = createSupabaseAdminClient();
  const { error: bootstrapError } = await admin.from("app_owner").upsert(
    { singleton: true, user_id: data.user.id, email: email.toLocaleLowerCase() },
    { onConflict: "singleton" }
  );

  if (bootstrapError) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=owner-bootstrap", url.origin));
  }

  return NextResponse.redirect(destination);
}
