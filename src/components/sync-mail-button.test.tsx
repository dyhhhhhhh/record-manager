import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncMailButton } from "@/components/sync-mail-button";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

describe("SyncMailButton", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "succeeded", scannedCount: 73, matchedCount: 41, failedCount: 0 })
    }));
  });

  it("requests a full one-year rescan from the secondary button", async () => {
    render(<SyncMailButton />);

    fireEvent.click(screen.getByRole("button", { name: "重新扫描近一年" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/mail/sync?mode=full", { method: "POST" });
    });
    expect(await screen.findByText(/已扫描 73 封/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
