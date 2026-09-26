import { describe, expect, it } from "vitest"

import {
  asciiDigits,
  caseNumberKey,
  isCaseNumber,
  sameCaseNumber,
  tidyCaseNumber,
} from "@/lib/case-number"
import { isNid, maskedNid, normalizeNid } from "@/lib/nid"

describe("case numbers", () => {
  it("match however they were typed, as the server matches them", () => {
    expect(caseNumberKey("G.R. 455/2026")).toBe("gr455/2026")
    expect(sameCaseNumber("G.R. 455/2026", "gr 455 / 2026")).toBe(true)
    expect(sameCaseNumber("G.R. 455/2026", "GR-455/2026")).toBe(true)
    expect(caseNumberKey("জি.আর. ৪৫৫/২০২৬")).toBe("জিআর455/2026")
    expect(sameCaseNumber("G.R. 455/2026", "G.R. 45/52026")).toBe(false)
    expect(sameCaseNumber("", " ")).toBe(false)
  })

  it("are tidied and checked before they are sent", () => {
    expect(tidyCaseNumber("  C.R.   88 / 2026 ")).toBe("C.R. 88/2026")
    expect(isCaseNumber("Family Suit 23/2026")).toBe(true)
    expect(isCaseNumber("মামলা ২৩/২০২৬")).toBe(true)
    expect(isCaseNumber("Pending")).toBe(false)
    expect(isCaseNumber(`G.R. ${"1".repeat(60)}`)).toBe(false)
    expect(asciiDigits("৪৫৫")).toBe("455")
  })
})

describe("NIDs", () => {
  it("take 10, 13 or 17 digits, spaced or in Bangla, and show only the last four", () => {
    expect(normalizeNid("2854 106-397")).toBe("2854106397")
    expect(normalizeNid("২৮৫৪১০৬৩৯৭")).toBe("2854106397")
    expect(isNid("2854106397")).toBe(true)
    expect(isNid("1966851734100056")).toBe(false)
    expect(isNid("19668517341000562")).toBe(true)
    expect(isNid("28541O6397")).toBe(false)
    expect(maskedNid("6397")).toBe("•••• 6397")
  })
})
