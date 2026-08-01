import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CoverImage } from "@/components/cover-image";

describe("CoverImage", () => {
  it("loads the remote image directly and shows a placeholder after an error", () => {
    render(
      <div className="relative size-24">
        <CoverImage alt="测试封面" fallbackLabel="暂无封面" sizes="96px" src="https://imusic.b-cdn.net/cover.jpg" />
      </div>
    );

    const image = screen.getByRole("img", { name: "测试封面" });
    expect(image).toHaveAttribute("src", "https://imusic.b-cdn.net/cover.jpg");

    fireEvent.error(image);
    expect(screen.getByText("暂无封面")).toBeInTheDocument();
  });
});
