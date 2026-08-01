import "server-only";

import { redirect } from "next/navigation";

import { isOwnerEmail } from "@/features/auth/owner";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireOwner() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user?.email || !isOwnerEmail(user.email, getServerEnv().OWNER_EMAIL)) {
    redirect("/login");
  }

  return user;
}
