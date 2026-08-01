const IMUSIC_COVER_HOSTS = new Set(["imusic.b-cdn.net", "imusic-static.b-cdn.net"]);

export function isTrustedImusicCoverUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && IMUSIC_COVER_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
