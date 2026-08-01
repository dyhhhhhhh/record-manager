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

  it("cancels a response that announces a body larger than five megabytes", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>(
      {
        cancel() {
          cancelled = true;
        }
      },
      { highWaterMark: 0 }
    );
    const response = new Response(body, {
      headers: {
        "content-length": String(5 * 1024 * 1024 + 1),
        "content-type": "image/jpeg"
      }
    });

    await expect(downloadCover("https://example.com/cover.jpg", async () => response)).rejects.toThrow(/5 MB/);
    expect(cancelled).toBe(true);
  });

  it("cancels the response stream as soon as the five megabyte limit is exceeded", async () => {
    let pullCount = 0;
    let cancelled = false;
    const chunks = [new Uint8Array(4 * 1024 * 1024), new Uint8Array(2 * 1024 * 1024)];
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const chunk = chunks[pullCount];
          pullCount += 1;
          if (!chunk) throw new Error("download continued after crossing the limit");
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        }
      },
      { highWaterMark: 0 }
    );
    const response = new Response(body, { headers: { "content-type": "image/webp" } });

    await expect(downloadCover("https://example.com/cover.webp", async () => response)).rejects.toThrow(/5 MB/);
    expect(pullCount).toBe(2);
    expect(cancelled).toBe(true);
  });
});
