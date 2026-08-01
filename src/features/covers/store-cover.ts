import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { downloadCover } from "@/features/covers/download-cover";

function isImusicCoverUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["imusic.b-cdn.net", "imusic-static.b-cdn.net"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function storeRemoteCover(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  sourceUrl: string | undefined
) {
  if (!sourceUrl || !isImusicCoverUrl(sourceUrl)) return null;

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
