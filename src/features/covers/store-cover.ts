import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { downloadCover } from "@/features/covers/download-cover";
import { isTrustedCoverUrl } from "@/features/covers/trusted-cover-url";
import type { Merchant } from "@/types/domain";

export async function storeRemoteCover(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  sourceUrl: string | undefined,
  merchant: Merchant
) {
  if (!sourceUrl || !isTrustedCoverUrl(sourceUrl, merchant)) return null;

  try {
    const cover = await downloadCover(sourceUrl);
    const path = `${userId}/${itemId}.${cover.extension}`;
    const { error } = await supabase.storage.from("album-covers").upload(path, cover.bytes, {
      contentType: cover.contentType,
      cacheControl: "31536000",
      upsert: true
    });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}
