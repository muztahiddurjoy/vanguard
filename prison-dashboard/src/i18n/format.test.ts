import { describe, expect, it } from "vitest"

import { createFormatters } from "@/i18n/format"

describe("createFormatters", () => {
  it("reads a court date as a local calendar day, whatever the time zone", () => {
    expect(createFormatters("en").day("2026-09-29")).toBe("29 Sept 2026")
    expect(createFormatters("en").longDay("2026-09-29")).toMatch(/^Tuesday,? 29 September 2026$/)
  })

  it("uses Bengali digits in Bengali", () => {
    const f = createFormatters("bn")
    expect(f.clock("10:30")).toBe("১০:৩০")
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
    expect(createFormatters("en").dayName("2026-09-24", now)).toBe("Tomorrow")
  })

  it("picks a sensible relative unit", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime()
    const f = createFormatters("en")
    expect(f.relative("2026-09-23T07:00:00Z", now)).toBe("5 hours ago")
    expect(f.relative("2026-09-20T12:00:00Z", now)).toBe("3 days ago")
    expect(f.relative("2026-10-02T12:00:00Z", now)).toBe("in 9 days")
  })
})
