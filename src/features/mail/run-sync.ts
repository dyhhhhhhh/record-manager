import "server-only";

import { QqImapGateway } from "@/features/mail/imap-gateway";
import { parseImusicMessage } from "@/features/mail/imusic-parser";
import { syncMailbox } from "@/features/mail/mail-sync";
import { SupabaseMailSyncRepository } from "@/features/mail/supabase-mail-repository";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function runOwnerMailSync(userId: string, mode: "incremental" | "full" = "incremental") {
  const env = getServerEnv();
  return syncMailbox({
    userId,
    mailbox: env.QQ_IMAP_EMAIL,
    now: new Date(),
    mode,
    gateway: new QqImapGateway(env.QQ_IMAP_EMAIL, env.QQ_IMAP_AUTH_CODE),
    repository: new SupabaseMailSyncRepository(createSupabaseAdminClient()),
    parse: parseImusicMessage
  });
}
