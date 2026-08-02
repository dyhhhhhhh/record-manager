import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SyncMailButton } from "@/components/sync-mail-button";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

describe("SyncMailButton", () => {
  afterEach(cleanup);

  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "succeeded", scannedCount: 73, matchedCount: 41, failedCount: 0 })
    }));
  });

  it("defaults to syncing messages since the last scan through one button", async () => {
    const { container } = render(<SyncMailButton />);

    expect(screen.queryByRole("button", { name: "重新扫描近一年" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "同步时间范围" })).toHaveTextContent("上一次扫描之后");
    expect(container.querySelector('input[name="range"]')).toHaveValue("since_last");
    fireEvent.click(screen.getByRole("button", { name: "同步邮件" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/mail/sync?range=since_last", { method: "POST" });
    });
    expect(await screen.findByText(/已扫描 73 封/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("offers all approved ranges and sends the selected calendar range", async () => {
    render(<SyncMailButton />);

    fireEvent.click(screen.getByRole("combobox", { name: "同步时间范围" }));
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringContaining("上一次扫描之后"),
      expect.stringContaining("1 个月"),
      expect.stringContaining("3 个月"),
      expect.stringContaining("6 个月"),
      expect.stringContaining("1 年")
    ]);
    fireEvent.click(screen.getByRole("option", { name: "3 个月" }));
    fireEvent.click(screen.getByRole("button", { name: "同步邮件" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/mail/sync?range=3m", { method: "POST" });
    });
  });

  it("disables both the range and submit controls while synchronizing", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    render(<SyncMailButton />);

    fireEvent.click(screen.getByRole("button", { name: "同步邮件" }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "同步时间范围" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "正在同步" })).toBeDisabled();
    });
  });

  it("shows the last synchronization time below the unified controls", () => {
    const { container } = render(<SyncMailButton lastSyncedAt="2026-08-01 20:30" />);

    expect(within(container).getByText("上次同步：2026-08-01 20:30")).toBeInTheDocument();
  });
});
