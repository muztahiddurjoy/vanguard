import { describe, expect, it } from "vitest"

import { createFormatters } from "@/i18n/format"

const TUE_2_TO_4 = { day: 2, startHour: 14, endHour: 16 }

describe("createFormatters", () => {
  it("formats the safe window per the spec in English", () => {
    expect(createFormatters("en").safeWindow(TUE_2_TO_4)).toBe("Tue 14:00–16:00")
  })

  it("uses Bengali weekday names and digits in Bengali", () => {
    const f = createFormatters("bn")
    expect(f.safeWindow(TUE_2_TO_4)).toBe("মঙ্গলবার ১৪:০০–১৬:০০")
    expect(f.pct(0.85)).toBe("৮৫%")
    expect(f.num(2)).toBe("২")
  })

  it("picks a sensible relative unit", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime()
    const f = createFormatters("en")
    expect(f.relative("2026-09-23T07:00:00Z", now)).toBe("5 hours ago")
    expect(f.relative("2026-09-20T12:00:00Z", now)).toBe("3 days ago")
    expect(f.relative("2026-10-02T12:00:00Z", now)).toBe("in 9 days")
  })
})
