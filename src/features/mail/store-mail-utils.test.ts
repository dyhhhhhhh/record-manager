import { describe, expect, it } from "vitest";

import {
  combineProductAndVariant,
  divideLineTotal,
  parseLocalizedMoney
} from "@/features/mail/store-mail-utils";

describe("independent store mail utilities", () => {
  it.each([
    ["€214,90", "214.90"],
    ["CNY ¥1,234.00", "1234.00"],
    ["1.234,56 EUR", "1234.56"],
    ["¥1,234", "1234"],
    ["100", "100"]
  ])("normalizes localized non-negative money %s", (input, expected) => {
    expect(parseLocalizedMoney(input)).toBe(expected);
  });

  it.each(["-1.00", "not money", "1.2.3.4"])("rejects invalid money %s", (input) => {
    expect(() => parseLocalizedMoney(input)).toThrow(/金额/);
  });

  it("derives an exact per-unit amount from a line total", () => {
    expect(divideLineTotal("39.98", 2)).toBe("19.99");
    expect(divideLineTotal("60", 3)).toBe("20.00");
  });

  it("rejects a per-unit amount that cannot be represented in cents", () => {
    expect(() => divideLineTotal("10.00", 3)).toThrow(/无法精确换算单价/);
    expect(() => divideLineTotal("10.00", 0)).toThrow(/数量/);
  });

  it("keeps a stable non-default product variant in the imported title", () => {
    expect(combineProductAndVariant("Synthetic Score", "Translucent Red"))
      .toBe("Synthetic Score · Translucent Red");
    expect(combineProductAndVariant("Synthetic Score", "Default Title"))
      .toBe("Synthetic Score");
  });
});
