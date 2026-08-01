"use server";

import { redirect } from "next/navigation";

import { authenticateOwnerPassword } from "@/features/auth/password-login";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithPassword(formData: FormData): Promise<never> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  let result: "success" | "invalid-credentials" | "system-error";

  try {
    const env = getServerEnv();
    result = await authenticateOwnerPassword(
      {
        username,
        password,
        ownerUsername: env.OWNER_USERNAME,
        ownerEmail: env.OWNER_EMAIL
      },
      {
        authClient: await createSupabaseServerClient(),
        adminClient: createSupabaseAdminClient()
      }
    );
  } catch {
    redirect("/login?error=system");
  }

  if (result === "success") {
    redirect("/");
  }

  redirect(result === "invalid-credentials" ? "/login?error=invalid-credentials" : "/login?error=system");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
