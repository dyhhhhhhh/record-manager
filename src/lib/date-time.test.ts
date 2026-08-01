import { describe, expect, it } from "vitest";

import {
  formatShanghaiDate,
  formatShanghaiDateTime,
  parseShanghaiDateTimeInput,
  toShanghaiDateTimeInput
} from "@/lib/date-time";

describe("Shanghai date formatting", () => {
  it("uses Asia/Shanghai across UTC day boundaries", () => {
    const value = "2026-07-31T16:30:00.000Z";
    expect(formatShanghaiDate(value)).toBe("2026/08/01");
    expect(formatShanghaiDateTime(value)).toBe("2026/08/01 00:30");
    expect(toShanghaiDateTimeInput(value)).toBe("2026-08-01T00:30");
  });

  it("parses a datetime-local value as Shanghai time", () => {
    expect(parseShanghaiDateTimeInput("2026-08-01T00:30")).toBe("2026-07-31T16:30:00.000Z");
  });
});
