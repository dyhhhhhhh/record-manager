import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1)
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(1),
  OWNER_EMAIL: z.email(),
  QQ_IMAP_EMAIL: z.email(),
  QQ_IMAP_AUTH_CODE: z.string().min(1),
  CRON_SECRET: z.string().min(16)
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parsePublicEnv(environment: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return publicEnvSchema.parse(environment);
}

export function parseServerEnv(environment: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return serverEnvSchema.parse(environment);
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  });
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    QQ_IMAP_EMAIL: process.env.QQ_IMAP_EMAIL,
    QQ_IMAP_AUTH_CODE: process.env.QQ_IMAP_AUTH_CODE,
    CRON_SECRET: process.env.CRON_SECRET
  });
}
