import "server-only";

import { QqImapGateway } from "@/features/mail/imap-gateway";
import { syncMailbox, type MailSyncRange } from "@/features/mail/mail-sync";
import { classifyOrderHeaders, parseOrderMessage } from "@/features/mail/order-mail-parser";
import { SupabaseMailSyncRepository } from "@/features/mail/supabase-mail-repository";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function runOwnerMailSync(userId: string, selection: MailSyncRange | "full" = "since_last") {
  const env = getServerEnv();
  return syncMailbox({
    userId,
    mailbox: env.QQ_IMAP_EMAIL,
    now: new Date(),
    mode: selection === "full" ? "full" : "incremental",
    range: selection === "full" ? "since_last" : selection,
    gateway: new QqImapGateway(env.QQ_IMAP_EMAIL, env.QQ_IMAP_AUTH_CODE),
    repository: new SupabaseMailSyncRepository(createSupabaseAdminClient()),
    classify: classifyOrderHeaders,
    parse: parseOrderMessage
  });
}
