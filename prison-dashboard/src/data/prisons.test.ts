import { describe, expect, it } from "vitest"

import { staffOfActor } from "@/data/prisons"

describe("staffOfActor", () => {
  it("finds the member of staff the server recorded as acting", () => {
    expect(staffOfActor("prison:JS-08")?.name.en).toBe("Nasima Khatun")
  })

  it("leaves anyone else alone", () => {
    expect(staffOfActor("court:CS-11")).toBeUndefined()
    expect(staffOfActor("Nasima Khatun")).toBeUndefined()
  })
})
