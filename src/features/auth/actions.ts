"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isOwnerEmail } from "@/features/auth/owner";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requestOtp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const env = getServerEnv();

  if (!isOwnerEmail(email, env.OWNER_EMAIL)) {
    redirect("/login?error=not-owner");
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: env.OWNER_EMAIL,
    options: { emailRedirectTo: `${origin}/auth/callback` }
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?sent=1");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
