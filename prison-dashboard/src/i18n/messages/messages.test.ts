import { describe, expect, it } from "vitest"

import { bn } from "@/i18n/messages/bn"
import { en } from "@/i18n/messages/en"

type Tree = { [key: string]: unknown }

/** Leaf strings; function messages are called with a placeholder so their text is compared too. */
function leaves(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out[path] = value
    else if (typeof value === "function")
      out[path] = (value as (...args: string[]) => string)("X", "Y")
    else Object.assign(out, leaves(value as Tree, path))
  }
  return out
}

// Pure formatting templates with no words to translate.
const SAME_IN_BOTH = [
  "login.demoAccount",
  "common.actionFor",
  "today.description",
  "update.description",
  "courtDates.caption",
]

describe("Bengali dictionary", () => {
  const enLeaves = leaves(en)
  const bnLeaves = leaves(bn)

  it("translates every message (none left identical to English)", () => {
    const untranslated = Object.keys(enLeaves).filter(
      (k) => enLeaves[k] === bnLeaves[k] && !SAME_IN_BOTH.includes(k),
    )
    expect(untranslated).toEqual([])
  })

  it("has no empty messages", () => {
    expect(Object.entries(bnLeaves).filter(([, v]) => !v.trim())).toEqual([])
  })
})
