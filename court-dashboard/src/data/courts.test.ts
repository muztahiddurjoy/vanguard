import { describe, expect, it } from "vitest"

import { staffOfActor } from "@/data/courts"

describe("staffOfActor", () => {
  it("finds the member of staff the server recorded as acting", () => {
    expect(staffOfActor("court:CS-11")?.name).toBe("Md. Abdul Hakim")
    expect(staffOfActor("court:cs-14")?.name).toBe("Farzana Yeasmin")
  })

  it("leaves anyone else alone", () => {
    expect(staffOfActor("prison:JS-08")).toBeUndefined()
    expect(staffOfActor("court:CS-99")).toBeUndefined()
    expect(staffOfActor("Md. Abdul Hakim")).toBeUndefined()
  })
})
