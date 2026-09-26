import { describe, expect, it } from "vitest"

import { checkRows, normalizeTime, parseCauseListPaste } from "@/lib/cause-list"

describe("parseCauseListPaste", () => {
  it("reads tab-separated rows from a spreadsheet and skips the header", () => {
    const text = [
      "Serial\tTime\tCase number\tPurpose",
      "1\t10:00\tC.R. 88/2026\tFor hearing",
      "7\t10:30\tG.R. 455/2026\tFor evidence",
      "",
    ].join("\r\n")
    expect(parseCauseListPaste(text)).toEqual({
      rows: [
        { serial: 1, time: "10:00", caseNumber: "C.R. 88/2026", purpose: "For hearing" },
        { serial: 7, time: "10:30", caseNumber: "G.R. 455/2026", purpose: "For evidence" },
      ],
      errors: [],
    })
  })

  it("reads comma-separated rows, with quoted and unquoted commas in the purpose", () => {
    const { rows, errors } = parseCauseListPaste(
      [
        '3,,G.R. 612/2026,"For hearing, and for bail"',
        "4,2:30 PM,C.R. 90 / 2026,For charge hearing, if the police report is in",
      ].join("\n"),
    )
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { serial: 3, caseNumber: "G.R. 612/2026", purpose: "For hearing, and for bail" },
      {
        serial: 4,
        time: "14:30",
        caseNumber: "C.R. 90/2026",
        purpose: "For charge hearing, if the police report is in",
      },
    ])
  })

  it("accepts Bangla digits and a Bangla header", () => {
    const { rows, errors } = parseCauseListPaste(
      "ক্রমিক\tসময়\tমামলা নম্বর\tউদ্দেশ্য\n১২\t১০.৩০\tজি.আর. ৪৫৫/২০২৬\tসাক্ষ্যগ্রহণ",
    )
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { serial: 12, time: "10:30", caseNumber: "জি.আর. ৪৫৫/২০২৬", purpose: "সাক্ষ্যগ্রহণ" },
    ])
  })

  it("reports each line that cannot be used, and keeps the others", () => {
    const text = [
      "1\t10:00\tC.R. 88/2026\tFor hearing",
      "1\t10:00\tG.R. 455/2026\tFor evidence", // serial used above
      "x\t10:00\tG.R. 1/2026\tFor hearing", // not a serial
      "2\t25:00\tG.R. 2/2026\tFor hearing", // not a time
      "3\t10:00\t\tFor hearing", // no case number
      "4\t10:00\tG.R. 4/2026\t", // no purpose
      "5\t10:00\tG.R. 5/2026", // a column short
      `6\t10:00\tG.R. 6/2026\t${"x".repeat(121)}`,
      "7\t11:00\tG.R. 7/2026\tFor order",
    ].join("\n")
    const { rows, errors } = parseCauseListPaste(text)
    expect(rows.map((r) => r.serial)).toEqual([1, 7])
    expect(errors).toEqual([
      { line: 2, problem: "duplicateSerial" },
      { line: 3, problem: "serial" },
      { line: 4, problem: "time" },
      { line: 5, problem: "caseNumber" },
      { line: 6, problem: "purpose" },
      { line: 7, problem: "columns" },
      { line: 8, problem: "purposeLong" },
    ])
  })

  it("ignores empty cells after the purpose", () => {
    expect(parseCauseListPaste("1\t\tC.R. 88/2026\tFor hearing\t\t\t").rows).toEqual([
      { serial: 1, caseNumber: "C.R. 88/2026", purpose: "For hearing" },
    ])
  })
})

describe("normalizeTime", () => {
  it("reads the ways a time is written", () => {
    expect(normalizeTime("9:05")).toBe("09:05")
    expect(normalizeTime("10.30")).toBe("10:30")
    expect(normalizeTime("10:30:00")).toBe("10:30")
    expect(normalizeTime("12:15 am")).toBe("00:15")
    expect(normalizeTime("১১:০০")).toBe("11:00")
    expect(normalizeTime(" ")).toBe("")
    expect(normalizeTime("24:00")).toBeNull()
    expect(normalizeTime("noon")).toBeNull()
  })
})

describe("checkRows", () => {
  it("marks a repeated serial on the later row and sends nothing until all rows are right", () => {
    const row = { time: "10:00", caseNumber: "C.R. 88/2026", purpose: "For hearing" }
    const bad = checkRows([
      { ...row, serial: "1" },
      { ...row, serial: "1" },
      { ...row, serial: "2", time: "later", purpose: " " },
    ])
    expect(bad.drafts).toBeNull()
    expect(bad.problems).toEqual([
      {},
      { serial: "serialTaken" },
      { time: "time", purpose: "purpose" },
    ])

    const good = checkRows([{ ...row, serial: "3", caseNumber: " G.R. 455 / 2026 " }])
    expect(good.drafts).toEqual([
      { serial: 3, time: "10:00", caseNumber: "G.R. 455/2026", purpose: "For hearing" },
    ])
    expect(checkRows([]).drafts).toEqual([])
  })
})
