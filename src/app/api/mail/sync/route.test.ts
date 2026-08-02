import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOwner, runOwnerMailSync } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  runOwnerMailSync: vi.fn()
}));

vi.mock("@/features/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/features/mail/run-sync", () => ({ runOwnerMailSync }));

import { POST } from "@/app/api/mail/sync/route";

describe("mail sync API range", () => {
  beforeEach(() => {
    requireOwner.mockReset().mockResolvedValue({ id: "owner-id" });
    runOwnerMailSync.mockReset().mockResolvedValue({
      status: "succeeded",
      scannedCount: 0,
      matchedCount: 0,
      failedCount: 0
    });
  });

  it("passes a supported calendar range to the mailbox synchronizer", async () => {
    const response = await POST(new Request("http://localhost/api/mail/sync?range=3m", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(runOwnerMailSync).toHaveBeenCalledWith("owner-id", "3m");
  });

  it("defaults an unsupported or missing range to since-last", async () => {
    await POST(new Request("http://localhost/api/mail/sync?range=invalid", { method: "POST" }));
    await POST(new Request("http://localhost/api/mail/sync", { method: "POST" }));

    expect(runOwnerMailSync).toHaveBeenNthCalledWith(1, "owner-id", "since_last");
    expect(runOwnerMailSync).toHaveBeenNthCalledWith(2, "owner-id", "since_last");
  });

  it("keeps the legacy full-rescan maintenance request", async () => {
    await POST(new Request("http://localhost/api/mail/sync?mode=full", { method: "POST" }));

    expect(runOwnerMailSync).toHaveBeenCalledWith("owner-id", "full");
  });
});
