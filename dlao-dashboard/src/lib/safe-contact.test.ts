import { describe, expect, it } from "vitest"

import { isWithinSafeWindow, nextSafeWindowStart } from "@/lib/safe-contact"

const TUE_2_TO_4 = { day: 2, startHour: 14, endHour: 16 }
// 2026-09-22 is a Tuesday
const at = (iso: string) => new Date(iso)

describe("isWithinSafeWindow", () => {
  it("is open only on the right day and hours", () => {
    expect(isWithinSafeWindow(at("2026-09-22T14:00:00"), TUE_2_TO_4)).toBe(true)
    expect(isWithinSafeWindow(at("2026-09-22T15:59:00"), TUE_2_TO_4)).toBe(true)
    expect(isWithinSafeWindow(at("2026-09-22T16:00:00"), TUE_2_TO_4)).toBe(false)
    expect(isWithinSafeWindow(at("2026-09-22T13:59:00"), TUE_2_TO_4)).toBe(false)
    expect(isWithinSafeWindow(at("2026-09-23T15:00:00"), TUE_2_TO_4)).toBe(false)
  })
})

describe("nextSafeWindowStart", () => {
  it("returns the coming Tuesday 14:00", () => {
    expect(nextSafeWindowStart(at("2026-09-23T09:00:00"), TUE_2_TO_4)).toEqual(
      at("2026-09-29T14:00:00")
    )
  })
  it("returns today's window if it has not ended", () => {
    expect(nextSafeWindowStart(at("2026-09-22T10:00:00"), TUE_2_TO_4)).toEqual(
      at("2026-09-22T14:00:00")
    )
    expect(nextSafeWindowStart(at("2026-09-22T15:00:00"), TUE_2_TO_4)).toEqual(
      at("2026-09-22T14:00:00")
    )
  })
  it("rolls over a week once today's window has closed", () => {
    expect(nextSafeWindowStart(at("2026-09-22T16:30:00"), TUE_2_TO_4)).toEqual(
      at("2026-09-29T14:00:00")
    )
  })
})
