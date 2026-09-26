import { describe, expect, it } from "vitest"

import { PRISONS } from "@/data/prisons"
import type { Prisoner, PrisonerStatus } from "@/data/types"
import { byRegister, inStatusFilter, matchesPrisoner } from "@/lib/prisoners"

function prisoner(over: Partial<Prisoner>): Prisoner {
  return {
    id: 1,
    prison: PRISONS[0],
    prisonerNo: "RCJ-2026-0412",
    name: "Jalal Uddin",
    nameBn: "জালাল উদ্দিন",
    fatherName: "Abdus Sattar",
    age: 36,
    gender: "male",
    nidLast4: null,
    nidVerified: false,
    village: null,
    upazila: null,
    district: null,
    admittedOn: "2026-06-15",
    status: "undertrial",
    ward: "Padma-3",
    releasedOn: null,
    nextCourtDate: null,
    ...over,
  }
}

describe("prisoner search", () => {
  const p = prisoner({})

  it("matches the prisoner number, in part", () => {
    expect(matchesPrisoner(p, "0412")).toBe(true)
    expect(matchesPrisoner(p, "rcj-2026")).toBe(true)
  })

  it("matches the name in English or Bangla, whatever the case", () => {
    expect(matchesPrisoner(p, "jalal")).toBe(true)
    expect(matchesPrisoner(p, "জালাল")).toBe(true)
  })

  it("matches the father's name", () => {
    expect(matchesPrisoner(p, "sattar")).toBe(true)
  })

  it("reads Bangla digits as the same number", () => {
    expect(matchesPrisoner(p, "০৪১২")).toBe(true)
  })

  it("matches everyone with an empty search, and no one with a stranger's name", () => {
    expect(matchesPrisoner(p, "  ")).toBe(true)
    expect(matchesPrisoner(p, "Sohel")).toBe(false)
  })
})

describe("status filter", () => {
  const at = (status: PrisonerStatus) => ({ status })

  it("shows those in custody by default: undertrial and convicted", () => {
    expect(inStatusFilter(at("undertrial"), "current")).toBe(true)
    expect(inStatusFilter(at("convicted"), "current")).toBe(true)
    expect(inStatusFilter(at("released"), "current")).toBe(false)
    expect(inStatusFilter(at("transferred"), "current")).toBe(false)
  })

  it("shows one status, or everyone", () => {
    expect(inStatusFilter(at("released"), "released")).toBe(true)
    expect(inStatusFilter(at("undertrial"), "released")).toBe(false)
    expect(inStatusFilter(at("transferred"), "all")).toBe(true)
  })

  it("lists undertrial prisoners first, then by number", () => {
    const list = [
      prisoner({ id: 1, prisonerNo: "RCJ-3", status: "convicted" }),
      prisoner({ id: 2, prisonerNo: "RCJ-2", status: "undertrial" }),
      prisoner({ id: 3, prisonerNo: "RCJ-1", status: "undertrial" }),
    ]
    expect([...list].sort(byRegister).map((p) => p.prisonerNo)).toEqual(["RCJ-1", "RCJ-2", "RCJ-3"])
  })
})
