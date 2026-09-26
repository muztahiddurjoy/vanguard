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

  it("labels today and tomorrow in words", () => {
    const now = new Date("2026-09-23T09:00:00").getTime()
    expect(createFormatters("en").dayLabel("2026-09-23T15:30:00", now)).toBe("Today")
    expect(createFormatters("en").dayLabel("2026-09-24T10:00:00", now)).toBe("Tomorrow")
    expect(createFormatters("en").dayLabel("2026-09-26T10:00:00", now)).toBe(
      "Saturday 26 September",
    )
    expect(createFormatters("bn").dayLabel("2026-09-24T10:00:00", now)).toBe("আগামীকাল")
  })

  it("reads a court's calendar day as that day, with its weekday", () => {
    const en = createFormatters("en")
    expect(en.day("2026-06-15")).toBe("15 Jun 2026")
    expect(en.weekDay("2026-09-29")).toMatch(/^Tue, 29 Sept? 2026$/)
    expect(en.clock("10:30")).toBe("10:30")
    const bn = createFormatters("bn")
    expect(bn.day("2026-06-15")).toContain("১৫")
    expect(bn.clock("10:30")).toBe("১০:৩০")
    // Anything else is shown as it came.
    expect(en.day("soon")).toBe("soon")
    expect(en.clock("morning")).toBe("morning")
  })

  it("picks a sensible relative unit", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime()
    const f = createFormatters("en")
    expect(f.relative("2026-09-23T07:00:00Z", now)).toBe("5 hours ago")
    expect(f.relative("2026-09-20T12:00:00Z", now)).toBe("3 days ago")
    expect(f.relative("2026-10-02T12:00:00Z", now)).toBe("in 9 days")
  })
})
