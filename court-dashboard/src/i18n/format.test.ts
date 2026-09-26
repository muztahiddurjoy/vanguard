import { describe, expect, it } from "vitest"

import { createFormatters } from "@/i18n/format"

describe("createFormatters", () => {
  it("uses Bengali digits in Bengali", () => {
    const f = createFormatters("bn")
    expect(f.pct(0.85)).toBe("৮৫%")
    expect(f.num(2)).toBe("২")
    expect(f.clock("10:30")).toBe("১০:৩০")
  })

  it("reads a court date as that calendar day, whatever the time zone", () => {
    const f = createFormatters("en")
    expect(f.day("2026-09-26")).toBe("26 Sept 2026")
    expect(f.longDay("2026-09-26")).toBe("Saturday, 26 September 2026")
    expect(f.clock("09:05")).toBe("09:05")
  })

  it("labels yesterday, today and tomorrow in words", () => {
    const now = new Date("2026-09-23T09:00:00").getTime()
    const en = createFormatters("en")
    expect(en.dayLabel("2026-09-23", now)).toBe("Today")
    expect(en.dayLabel("2026-09-22", now)).toBe("Yesterday")
    expect(en.dayLabel("2026-09-24T10:00:00", now)).toBe("Tomorrow")
    expect(en.dayLabel("2026-09-26", now)).toBe("Saturday 26 September")
    expect(createFormatters("bn").dayLabel("2026-09-24", now)).toBe("আগামীকাল")
  })

  it("picks a sensible relative unit", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime()
    const f = createFormatters("en")
    expect(f.relative("2026-09-23T07:00:00Z", now)).toBe("5 hours ago")
    expect(f.relative("2026-09-20T12:00:00Z", now)).toBe("3 days ago")
    expect(f.relative("2026-10-02T12:00:00Z", now)).toBe("in 9 days")
  })
})
