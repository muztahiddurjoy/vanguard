import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { renderApp, samplePaper } from "@/test/render-app"

/** The NID of Rahima Begum in the built-in registry, and her date of birth. */
const NID = "6390284417"
const DOB = "1992-02-11"

async function verifyIdentity(user: ReturnType<typeof renderApp>["user"]) {
  await user.type(screen.getByLabelText("NID number"), NID)
  await user.type(screen.getByLabelText("Date of birth"), DOB)
  await user.click(screen.getByRole("button", { name: "Check" }))
  expect(await screen.findByText("Identity checked")).toBeInTheDocument()
}

async function fillApplication(user: ReturnType<typeof renderApp>["user"]) {
  await user.click(screen.getByRole("button", { name: /^Next/ }))
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 2, name: "The application" })).toBeInTheDocument(),
  )
  await user.type(screen.getByLabelText("Their mobile number"), "01712345678")
  await user.click(screen.getByRole("checkbox", { name: "Cannot read or write" }))
  await user.click(screen.getByRole("combobox", { name: "Help needed" }))
  await user.click(await screen.findByRole("option", { name: "A family matter" }))
  await user.type(
    screen.getByLabelText("What happened, in your words"),
    "Her husband has stopped paying maintenance for their two children.",
  )
}

describe("filing an application at the counter", () => {
  it("goes from the NID card to a tracking number, with the papers she brought", async () => {
    const { user } = renderApp({ path: "/applications/new" })

    // 1. Who is in front of you.
    await verifyIdentity(user)
    // The registry's own spelling, so nothing is mistyped from the card.
    expect(screen.getByText("Rahima Begum")).toBeInTheDocument()
    expect(screen.getByText("•••• 4417")).toBeInTheDocument()

    // 2. What she needs, and why the centre is filing.
    await fillApplication(user)
    await user.click(screen.getByRole("button", { name: /^Next/ }))

    // 3. The papers she brought, queued until the application has a number.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Papers" })).toBeInTheDocument(),
    )
    await user.upload(screen.getByLabelText("Choose a file"), samplePaper("kabinnama.pdf"))
    // The kind is guessed from the file name, so most papers need no thought.
    expect(screen.getByRole("combobox", { name: "What is it?" })).toHaveTextContent(
      "Kabinnama (marriage)",
    )
    expect(
      screen.getByText("Chosen from the file name. Change it if it is wrong."),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Add a paper" }))
    expect(await screen.findByText("kabinnama.pdf")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^Next/ }))

    // 4. Her signature, which only a checked identity allows.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Signature" })).toBeInTheDocument(),
    )
    // jsdom has no canvas, so the dashboard offers the picture instead of the pad.
    await user.upload(
      screen.getByLabelText("Picture of the signature or thumbprint"),
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "sign.png", { type: "image/png" }),
    )
    await waitFor(() => expect(screen.getByAltText("The signature")).toBeInTheDocument())
    await user.click(screen.getByRole("button", { name: /^Next/ }))

    // 5. Read it back to her, then file.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Check and file" })).toBeInTheDocument(),
    )
    expect(screen.getByText(/Kabinnama \(marriage\) — kabinnama.pdf/)).toBeInTheDocument()
    expect(screen.getByText("Cannot read or write")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "File the application" }))

    // The number is what she leaves with, so it must be on screen and readable.
    expect(await screen.findByRole("heading", { name: /Filed/ })).toBeInTheDocument()
    expect(screen.getByText("Their tracking number")).toBeInTheDocument()
    expect(screen.getByText(/^\d{4}-\d{4}$/)).toBeInTheDocument()
    // She has a phone, so it went by SMS too.
    expect(screen.getByText(/No SMS was really sent/)).toBeInTheDocument()
    expect(screen.queryByText(/No phone number was given/)).not.toBeInTheDocument()
  })

  it("tells the operator to write the number down when she has no phone", async () => {
    const { user } = renderApp({ path: "/applications/new" })
    await verifyIdentity(user)

    await user.click(screen.getByRole("button", { name: /^Next/ }))
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "The application" }))
    await user.click(screen.getByRole("checkbox", { name: "Has no phone of their own" }))
    await user.click(screen.getByRole("combobox", { name: "Help needed" }))
    await user.click(await screen.findByRole("option", { name: "A civil case" }))
    await user.type(
      screen.getByLabelText("What happened, in your words"),
      "A neighbour has taken part of the land she inherited from her father.",
    )
    await user.click(screen.getByRole("button", { name: /^Next/ }))

    // No papers today, and she cannot sign.
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "Papers" }))
    await user.click(screen.getByRole("button", { name: "No papers today" }))
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "Signature" }))
    await user.click(screen.getByRole("button", { name: "She cannot sign now" }))
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "Check and file" }))
    expect(screen.getByText("No papers added yet.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "File the application" }))

    expect(await screen.findByRole("heading", { name: /Filed/ })).toBeInTheDocument()
    expect(
      screen.getByText(/No phone number was given, so this number is all they have/),
    ).toBeInTheDocument()
  })

  it("will not go on until it knows what help she needs and what happened", async () => {
    const { user } = renderApp({ path: "/applications/new" })
    await verifyIdentity(user)
    await user.click(screen.getByRole("button", { name: /^Next/ }))
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "The application" }))

    await user.click(screen.getByRole("button", { name: /^Next/ }))
    expect(await screen.findByText("Choose what help they need")).toBeInTheDocument()
    expect(screen.getByText("Write at least 20 characters")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "The application" })).toBeInTheDocument()
  })

  it("refuses a mobile number that would send her tracking number to a stranger", async () => {
    const { user } = renderApp({ path: "/applications/new" })
    await verifyIdentity(user)
    await user.click(screen.getByRole("button", { name: /^Next/ }))
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "The application" }))

    await user.type(screen.getByLabelText("Their mobile number"), "0171234")
    await user.click(screen.getByRole("combobox", { name: "Help needed" }))
    await user.click(await screen.findByRole("option", { name: "Something else" }))
    await user.type(
      screen.getByLabelText("What happened, in your words"),
      "She was refused her widow allowance at the union office.",
    )
    await user.click(screen.getByRole("button", { name: /^Next/ }))

    expect(await screen.findByText("A mobile number looks like 01712345678")).toBeInTheDocument()
  })

  it("lets the centre go on without e-KYC once the registry has failed twice", async () => {
    const { user } = renderApp({ path: "/applications/new" })

    for (const attempt of [1, 2]) {
      await user.clear(screen.getByLabelText("NID number"))
      await user.type(screen.getByLabelText("NID number"), "1234567890")
      await user.clear(screen.getByLabelText("Date of birth"))
      await user.type(screen.getByLabelText("Date of birth"), "1990-01-01")
      await user.click(screen.getByRole("button", { name: "Check" }))
      await screen.findByText("This did not match the registry.")
      expect(attempt).toBeGreaterThan(0)
    }

    // Two failures: the office will have to check it later rather than turn her away.
    expect(
      screen.getByText("You can go on without checking. The office will check it later."),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Go on without checking" }))
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "The application" }))
    // Her own details must now be typed, and no signature can be taken.
    expect(screen.getByLabelText("Full name")).toBeInTheDocument()
  })

  it("refuses a file the server would not store", async () => {
    const { user } = renderApp({ path: "/applications/new" })
    await verifyIdentity(user)
    await fillApplication(user)
    await user.click(screen.getByRole("button", { name: /^Next/ }))
    await waitFor(() => screen.getByRole("heading", { level: 2, name: "Papers" }))

    // A scan from a flatbed at full resolution: the right type, far too big to send.
    await user.upload(
      screen.getByLabelText("Choose a file"),
      samplePaper("scan.pdf", "application/pdf", 11 * 1024 * 1024),
    )
    expect(await screen.findByText("The file must be 10 MB or smaller")).toBeInTheDocument()
    // Nothing was queued, so "Add a paper" is not offered for it.
    expect(screen.queryByRole("button", { name: "Add a paper" })).not.toBeInTheDocument()

    // The input's accept list keeps the wrong type out of an ordinary file picker; this
    // goes round it the way a drag-and-drop or an "All files" picker would.
    const anyFile = userEvent.setup({ applyAccept: false })
    await anyFile.upload(
      screen.getByLabelText("Choose a file"),
      new File(["x"], "notes.docx", { type: "application/msword" }),
    )
    expect(await screen.findByText("Add a PDF, JPEG, PNG or text file")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add a paper" })).not.toBeInTheDocument()
  })
})

describe("the applications the centre has filed", () => {
  it("lists them with what each one is still missing", async () => {
    renderApp({ path: "/applications" })
    const table = await screen.findByRole("table", { name: "Applications this centre filed" })

    // The three built-in sample applications, newest first.
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText("Kamal Hossain")).toBeInTheDocument()
    expect(within(rows[0]).getByText("Not checked")).toBeInTheDocument()
    expect(within(rows[0]).getByText("No papers")).toBeInTheDocument()
    expect(within(rows[2]).getByText("2 papers")).toBeInTheDocument()
  })

  it("shows on Today what only the centre can finish", async () => {
    renderApp({ path: "/" })
    const panel = await screen.findByRole("region", { name: "Applications still to finish" })

    // Kamal Hossain was filed before the registry could be reached.
    expect(within(panel).getByRole("link", { name: "Kamal Hossain" })).toBeInTheDocument()
    expect(within(panel).getByText("Identity not checked")).toBeInTheDocument()
    expect(within(panel).getByText("Not signed")).toBeInTheDocument()
    // Rahima Begum is complete, so she is not on the list.
    expect(within(panel).queryByText("Rahima Begum")).not.toBeInTheDocument()
  })
})
