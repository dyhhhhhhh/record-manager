const MAX_COVER_BYTES = 5 * 1024 * 1024;

const SUPPORTED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function downloadCover(url: string, fetcher: Fetcher = fetch) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") throw new Error("封面地址必须使用 HTTPS");

  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "Pressed/1.0 album-cover-import" }
  });
  if (!response.ok) throw new Error(`封面下载失败（HTTP ${response.status}）`);

  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLocaleLowerCase();
  if (!contentType || !(contentType in SUPPORTED_TYPES)) throw new Error("不支持的封面格式");

  const announcedSize = Number(response.headers.get("content-length") ?? 0);
  if (announcedSize > MAX_COVER_BYTES) throw new Error("封面不能超过 5 MB");

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_COVER_BYTES) throw new Error("封面不能超过 5 MB");

  return {
    bytes,
    contentType: contentType as keyof typeof SUPPORTED_TYPES,
    extension: SUPPORTED_TYPES[contentType as keyof typeof SUPPORTED_TYPES]
  };
}
