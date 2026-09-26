import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

type User = ReturnType<typeof renderApp>["user"]

const stepHeading = () => screen.getByRole("heading", { level: 2 })
const png = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "signature.png", {
    type: "image/png",
  })

async function verify(user: User, nid: string, dob: string) {
  const nidInput = screen.getByLabelText("NID number")
  await user.clear(nidInput)
  await user.type(nidInput, nid)
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: dob } })
  await user.click(screen.getByRole("button", { name: "Verify" }))
}

async function choose(user: User, label: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }))
  await user.click(await screen.findByRole("option", { name: option }))
}

describe("the new application wizard", () => {
  it("verifies Jalal Uddin, takes the application and a signature, and gives a tracking number", async () => {
    const { user } = renderApp({ path: "/applications/new?case=1&party=0" })
    expect(await screen.findByText(/For Jalal Uddin in G\.R\. 455\/2026\./)).toBeInTheDocument()
    const steps = screen.getByRole("list", { name: "Steps" })
    expect(within(steps).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step")
    expect(screen.getByLabelText("Name as on the NID")).toHaveValue("Jalal Uddin")
    // No way on until the identity is checked (or two checks fail).
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "A signature needs a verified identity. Without e-KYC the application can still be sent, unsigned.",
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(screen.getByText("Enter a 10, 13 or 17 digit NID.")).toBeInTheDocument()

    await verify(user, "2854106397", "1990-06-05")
    const card = (await screen.findByText("Identity verified")).closest("div")!
    expect(card).toHaveTextContent("Abdus Sattar")
    expect(card).toHaveTextContent("Shyampur, Pirgachha, Rangpur")
    expect(card).toHaveTextContent("•••• 6397")
    expect(card).not.toHaveTextContent("2854106397")

    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(stepHeading()).toHaveTextContent("Application")
    expect(stepHeading()).toHaveFocus()
    expect(
      screen.getByText("From the NID registry. These details cannot be changed here."),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Court case" })).toHaveTextContent(
      "G.R. 455/2026 · State vs. Jalal Uddin",
    )
    // A jail holds him on this case.
    expect(screen.getByRole("checkbox", { name: "The applicant is in custody" })).toBeChecked()

    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Choose the help needed.")).toBeInTheDocument()
    expect(screen.getByText("Please write at least 20 characters.")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Help needed" })).toHaveFocus()

    await choose(user, "Help needed", "Defence in a criminal case")
    await user.type(
      screen.getByLabelText("What help is needed, and why"),
      "Charge framed; no defence lawyer at the last hearing. Evidence begins on the next date.",
    )
    await user.click(screen.getByRole("button", { name: "Next" }))

    expect(stepHeading()).toHaveTextContent("Signature")
    // jsdom cannot draw: the upload is offered instead.
    await user.click(screen.getByRole("button", { name: "Sign on screen" }))
    expect(
      screen.getByText(
        "Signing on screen does not work on this device. Upload a scanned signature or thumbprint instead.",
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Upload a scan" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Ask the applicant to sign, or upload a scan.")).toBeInTheDocument()

    // The file picker filters by type, but a renamed file or another browser can pass anything.
    await userEvent
      .setup({ applyAccept: false })
      .upload(
        screen.getByLabelText("Scanned signature or thumbprint"),
        new File(["%PDF"], "scan.pdf", { type: "application/pdf" }),
      )
    expect(screen.getByText("Choose a PNG or JPEG image.")).toBeInTheDocument()
    await user.upload(screen.getByLabelText("Scanned signature or thumbprint"), png())
    expect(
      await screen.findByRole("img", { name: "The signature that will be sent" }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next" }))

    // Nothing entered is lost going back and forth.
    expect(stepHeading()).toHaveTextContent("Review and submit")
    await user.click(screen.getByRole("button", { name: "Back" }))
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByLabelText("What help is needed, and why")).toHaveValue(
      "Charge framed; no defence lawyer at the last hearing. Evidence begins on the next date.",
    )
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByText("Identity verified")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByRole("img", { name: "The signature that will be sent" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next" }))

    const identity = screen.getByRole("region", { name: "Identity" })
    expect(identity).toHaveTextContent("Verified by e-KYC · NID •••• 6397")
    expect(screen.getByRole("region", { name: "Applicant" })).toHaveTextContent("Jalal Uddin")
    expect(screen.getByRole("region", { name: "The request" })).toHaveTextContent(
      "Defence in a criminal case",
    )
    expect(screen.getByRole("region", { name: "Signature" })).toHaveTextContent(
      "Scanned signature or thumbprint",
    )

    await user.click(screen.getByRole("button", { name: "Submit to the legal aid office" }))
    const done = await screen.findByRole("heading", { level: 2, name: "Application sent" })
    expect(done).toHaveFocus()
    expect(screen.getByText(/^\d{4}-\d{4}$/)).toBeInTheDocument()
    expect(
      screen.getByText(
        "Give this number to the applicant: they can follow the case by calling the helpline 16430.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("What happens next")).toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "Open the application" }))
    expect(
      await screen.findByRole("heading", { level: 1, name: "Jalal Uddin" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Identity" })).toHaveTextContent("NID •••• 6397")
    expect(screen.getByRole("region", { name: "Signature" })).toHaveTextContent(
      "taken by Md. Abdul Hakim",
    )
    expect(screen.getByRole("region", { name: "Where it stands" })).toHaveTextContent("Received")

    await user.click(screen.getByRole("link", { name: "G.R. 455/2026" }))
    const legalAid = await screen.findByRole("region", { name: "Legal aid" })
    expect(legalAid).toHaveTextContent(/APP-\d{4}-031/)
  })

  it("goes on without e-KYC after two misses, then verifies and signs from the application page", async () => {
    const { user } = renderApp({ path: "/applications/new" })
    await screen.findByRole("heading", { level: 2, name: "Check the applicant's identity (e-KYC)" })
    await user.type(screen.getByLabelText("Name as on the NID"), "Kamal Hossain")
    await verify(user, "5068247712", "1990-03-13")
    expect(
      await screen.findByText("The details did not match the NID registry."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Continue without e-KYC" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(
      await screen.findByText(
        "The details did not match twice. You can continue without e-KYC: the application is sent unsigned.",
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Continue without e-KYC" }))

    await user.type(screen.getByLabelText("Name"), "Kamal Hossain")
    await choose(user, "Help needed", "Bail")
    await choose(user, "Court case", "C.R. 88/2026 · Abdul Jalil vs. Kamal Hossain")
    await user.type(
      screen.getByLabelText("What help is needed, and why"),
      "He cannot pay a lawyer for his bail petition; hearing is today.",
    )
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(
      screen.getByText(/A signature needs a verified identity\. Submit without it/),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Skip: add it later" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByRole("region", { name: "Identity" })).toHaveTextContent("Not verified")
    expect(screen.getByRole("region", { name: "Signature" })).toHaveTextContent(
      "Not signed: add it later",
    )
    await user.click(screen.getByRole("button", { name: "Submit to the legal aid office" }))
    await user.click(await screen.findByRole("link", { name: "Open the application" }))

    await screen.findByRole("heading", { level: 1, name: "Kamal Hossain" })
    const sign = screen.getByRole("button", { name: "Add signature" })
    expect(sign).toBeDisabled()
    expect(
      screen.getByText("A signature needs a verified identity. Verify the applicant first."),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Verify now" }))
    const dialog = await screen.findByRole("dialog", { name: "Verify the applicant's identity" })
    expect(within(dialog).getByRole("button", { name: "Use this identity" })).toBeDisabled()
    await verify(user, "5068247712", "1990-03-12")
    await within(dialog).findByText("Identity verified")
    await user.click(within(dialog).getByRole("button", { name: "Use this identity" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByRole("region", { name: "Identity" })).toHaveTextContent("NID •••• 7712")

    await user.click(screen.getByRole("button", { name: "Add signature" }))
    const signDialog = await screen.findByRole("dialog", { name: "Add the applicant's signature" })
    await user.upload(within(signDialog).getByLabelText("Scanned signature or thumbprint"), png())
    await within(signDialog).findByRole("img", { name: "The signature that will be sent" })
    await user.click(within(signDialog).getByRole("button", { name: "Save the signature" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByRole("region", { name: "Signature" })).toHaveTextContent(
      "taken by Md. Abdul Hakim",
    )
  })
})

describe("the court's applications", () => {
  it("lists what the court sent, and today's page asks for what is missing", async () => {
    const { user } = renderApp({ path: "/applications" })
    expect(
      await screen.findByText(
        "No applications yet. Send one for anyone before the court who needs a lawyer.",
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "New legal aid application" }))
    await user.type(await screen.findByLabelText("Name as on the NID"), "Abdul Jalil")
    await verify(user, "1234567890", "1980-01-01")
    await screen.findByText("The details did not match the NID registry.")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    await user.click(await screen.findByRole("button", { name: "Continue without e-KYC" }))
    await user.type(screen.getByLabelText("Name"), "Abdul Jalil")
    await choose(user, "Help needed", "Other help")
    await user.type(
      screen.getByLabelText("What help is needed, and why"),
      "The complainant asks for advice on a compromise petition.",
    )
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    const submit = screen.getByRole("button", { name: "Submit to the legal aid office" })
    // A double click sends one application.
    await user.dblClick(submit)
    await screen.findByRole("heading", { name: "Application sent" })

    await user.click(screen.getByRole("link", { name: "Legal aid" }))
    const table = await screen.findByRole("table", { name: "Applications from this court" })
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent("Abdul Jalil")
    expect(rows[0]).toHaveTextContent("Received")
    expect(rows[0]).toHaveTextContent("Not verified")
    expect(rows[0]).toHaveTextContent("Not signed")

    await choose(user, "Stage", "Lawyer assigned")
    expect(screen.getByText("No application is at this stage.")).toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "Today" }))
    const waiting = (
      await screen.findByRole("heading", { name: "Waiting for identity or signature" })
    ).closest("[data-slot=card]") as HTMLElement
    expect(within(waiting).getByRole("link", { name: "Abdul Jalil" })).toBeInTheDocument()
    expect(waiting).toHaveTextContent("Identity not verified")
    expect(waiting).toHaveTextContent("Not signed")
  })
})
