import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MerchantIcon } from "@/components/merchant-icon";
import { MERCHANT_LABELS } from "@/lib/merchant";
import type { Merchant } from "@/types/domain";

const EXPECTED = {
  imusic: { path: "/merchants/imusic.png", fallback: "iM" },
  hmv: { path: "/merchants/hmv.png", fallback: "H" },
  mutant: { path: "/merchants/mutant.png", fallback: "M" },
  black_screen: { path: "/merchants/black-screen.png", fallback: "BS" },
  laced: { path: "/merchants/laced.png", fallback: "L" },
  cdjapan: { path: "/merchants/cdjapan.svg", fallback: "CDJ" }
} as const satisfies Record<Merchant, { path: string; fallback: string }>;

afterEach(cleanup);

describe("MerchantIcon", () => {
  it.each(Object.entries(EXPECTED) as Array<[Merchant, (typeof EXPECTED)[Merchant]]>)(
    "maps %s to its local official icon",
    (merchant, expected) => {
      render(<MerchantIcon merchant={merchant} />);

      const icon = screen.getByLabelText(MERCHANT_LABELS[merchant]);
      expect(icon).toHaveAttribute("role", "img");
      expect(icon).toHaveAttribute("title", MERCHANT_LABELS[merchant]);
      expect(icon.querySelector("img")).toHaveAttribute("src", expect.stringContaining(expected.path));
      expect(screen.queryByText(MERCHANT_LABELS[merchant])).not.toBeInTheDocument();
    }
  );

  it("shows a readable abbreviation when a local icon fails", () => {
    render(<MerchantIcon merchant="black_screen" size={24} />);

    const icon = screen.getByLabelText("Black Screen Records");
    fireEvent.error(icon.querySelector("img")!);

    expect(screen.getByText("BS")).toBeInTheDocument();
    expect(icon).toHaveStyle({ width: "24px", height: "24px" });
  });
});
