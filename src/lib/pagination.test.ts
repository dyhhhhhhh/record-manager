import { describe, expect, it } from "vitest";

import { clampPage } from "@/lib/pagination";

describe("page number normalization", () => {
  it("keeps page numbers inside the available range", () => {
    expect(clampPage("3", 5)).toBe(3);
    expect(clampPage("99", 5)).toBe(5);
    expect(clampPage("-2", 5)).toBe(1);
    expect(clampPage("Infinity", 5)).toBe(1);
    expect(clampPage(undefined, 0)).toBe(1);
  });
});
