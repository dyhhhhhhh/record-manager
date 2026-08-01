import { describe, expect, it } from "vitest";

import { downloadCover } from "@/features/covers/download-cover";

describe("cover download validation", () => {
  it("accepts a small supported image", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
    const result = await downloadCover("https://example.com/cover.png", async () => response);
    expect(result).toMatchObject({ contentType: "image/png", extension: "png" });
    expect(result.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects unsupported image formats", async () => {
    const response = new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } });
    await expect(downloadCover("https://example.com/cover.svg", async () => response)).rejects.toThrow(/格式/);
  });

  it("rejects payloads larger than five megabytes", async () => {
    const response = new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
      headers: { "content-type": "image/jpeg" }
    });
    await expect(downloadCover("https://example.com/cover.jpg", async () => response)).rejects.toThrow(/5 MB/);
  });
});
