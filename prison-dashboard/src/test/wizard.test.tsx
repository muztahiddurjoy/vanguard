import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

const step = () => screen.getByRole("region", { name: /^(Identity|Application|Signature|Review)/ })
const scan = () => new File(["\x89PNG signature"], "signature.png", { type: "image/png" })

describe("a new legal aid application", () => {
  it("verifies Jalal Uddin, sends his application with his signature, and gives the tracking number", async () => {
    const { user } = renderApp({ path: "/applications/new?prisoner=1" })

    // Step 1: e-KYC, prefilled from the prisoner.
    expect(await screen.findByRole("heading", { name: "Identity (e-KYC)" })).toBeInTheDocument()
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("Jalal Uddin")
    expect(step()).toHaveTextContent("A signature needs a verified identity.")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(screen.getByText("Enter a 10, 13 or 17 digit NID number.")).toBeInTheDocument()
    expect(screen.getByLabelText("NID number")).toHaveFocus()
    // No way on until the identity is checked.
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText("NID number"), "2854106397")
    await user.type(screen.getByLabelText("Date of birth"), "1990-06-05")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(await screen.findByText("Identity verified")).toBeInTheDocument()
    expect(step()).toHaveTextContent("Abdus Sattar")
    expect(step()).toHaveTextContent("Shyampur, Pirgachha, Rangpur")
    expect(step()).toHaveTextContent("•••• 6397")
    await user.click(screen.getByRole("button", { name: "Next" }))

    // Step 2: the prisoner, the applicant from the registry, the help needed and why.
    const heading = await screen.findByRole("heading", { name: "Application" })
    expect(heading).toHaveFocus()
    expect(screen.getByRole("combobox", { name: "Prisoner" })).toHaveTextContent(
      "RCJ-2026-0412 · Jalal Uddin",
    )
    expect(screen.getByLabelText("Name")).toHaveValue("Jalal Uddin")
    expect(screen.getByLabelText("Name")).toHaveAttribute("readonly")
    expect(screen.getByLabelText("Name in Bangla")).toHaveValue("জালাল উদ্দিন")
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Choose the help needed.")).toBeInTheDocument()
    expect(screen.getByText("Please write at least 20 characters.")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Defence in a criminal case" })).toHaveFocus()

    await user.click(screen.getByRole("radio", { name: "Defence in a criminal case" }))
    const why = "Charged under s. 379. His lawyer withdrew in August; evidence starts in 3 days."
    await user.type(screen.getByLabelText("What help is needed, and why"), why)
    expect(screen.getByText(`${why.length} of 20 characters`)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next" }))

    // Step 3: the signature (a scan here: jsdom cannot draw).
    expect(await screen.findByRole("heading", { name: "Signature" })).toHaveFocus()
    expect(screen.getByRole("tab", { name: "Upload a scan" })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await user.upload(screen.getByLabelText("Scanned signature or thumbprint"), scan())
    expect(await screen.findByText(/Chosen: signature\.png/)).toBeInTheDocument()

    // Back and forth loses nothing.
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(screen.getByLabelText("What help is needed, and why")).toHaveValue(why)
    expect(screen.getByRole("radio", { name: "Defence in a criminal case" })).toBeChecked()
    await user.click(screen.getByRole("button", { name: "Identity: done" }))
    expect(screen.getByLabelText("NID number")).toHaveValue("2854106397")
    expect(screen.getByText("Identity verified")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Signature" }))
    expect(screen.getByAltText("The signature")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Next" }))

    // Step 4: review and submit.
    const review = await screen.findByRole("region", { name: "Review and submit" })
    expect(review).toHaveTextContent("Verified with e-KYC: Jalal Uddin, NID •••• 6397")
    expect(review).toHaveTextContent("RCJ-2026-0412 · Jalal Uddin")
    expect(review).toHaveTextContent("Defence in a criminal case")
    expect(review).toHaveTextContent(why)
    expect(within(review).getByAltText("The signature")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Submit to the legal aid office" }))

    expect(await screen.findByRole("heading", { name: "Application sent" })).toBeInTheDocument()
    expect(screen.getByText("Tracking number").nextElementSibling?.textContent).toMatch(
      /^\d{4}-\d{4}$/,
    )
    expect(
      screen.getByText(
        "Give this number to the prisoner or their family: they can follow the case by calling the helpline 16430.",
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "Open the application" }))
    const identity = await screen.findByRole("region", { name: "Identity" })
    expect(identity).toHaveTextContent("Verified")
    expect(identity).toHaveTextContent("NID •••• 6397")
    expect(screen.getByRole("region", { name: "Signature" })).toHaveTextContent("Signed")
    expect(screen.getByRole("region", { name: "Where it stands" })).toHaveTextContent("Received")
  })

  it("goes on without e-KYC after two misses, and verifies and signs later", async () => {
    const { user } = renderApp({ path: "/applications/new" })
    await screen.findByRole("heading", { name: "Identity (e-KYC)" })
    await user.type(screen.getByLabelText("NID number"), "2854106397")
    await user.type(screen.getByLabelText("Date of birth"), "1991-01-01")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(
      await screen.findByText("The details did not match the NID registry."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Continue without e-KYC" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(await screen.findByText("Tries that did not match: 2")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Continue without e-KYC" }))

    // Nobody chosen yet: the prisoner is required.
    await screen.findByRole("heading", { name: "Application" })
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Choose the prisoner.")).toBeInTheDocument()
    await user.click(screen.getByRole("combobox", { name: "Prisoner" }))
    await user.click(await screen.findByRole("option", { name: "RCJ-2026-0412 · Jalal Uddin" }))
    // Choosing the prisoner fills the applicant from their record, still editable.
    expect(screen.getByLabelText("Name")).toHaveValue("Jalal Uddin")
    expect(screen.getByLabelText("Name")).not.toHaveAttribute("readonly")
    expect(screen.getByLabelText("Father's name")).toHaveValue("Abdus Sattar")
    await user.click(screen.getByRole("radio", { name: "Bail" }))
    await user.type(
      screen.getByLabelText("What help is needed, and why"),
      "He wants to apply for bail; his family can stand surety.",
    )
    await user.click(screen.getByRole("button", { name: "Next" }))

    // Without a verified identity, the signature waits.
    await screen.findByRole("heading", { name: "Signature" })
    expect(
      screen.getByText(/A signature needs a verified identity. Verify the prisoner in step 1/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("Scanned signature or thumbprint")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Skip: add it later" }))
    const review = await screen.findByRole("region", { name: "Review and submit" })
    expect(review).toHaveTextContent("Not verified. You can verify it later from the application.")
    await user.click(screen.getByRole("button", { name: "Submit to the legal aid office" }))
    await user.click(await screen.findByRole("link", { name: "Open the application" }))

    // Later, from the application: verify, then sign.
    const signature = await screen.findByRole("region", { name: "Signature" })
    expect(within(signature).getByRole("button", { name: "Add signature" })).toBeDisabled()
    expect(signature).toHaveTextContent("Verify the identity first")
    await user.click(screen.getByRole("button", { name: "Verify now" }))
    const verify = await screen.findByRole("dialog", { name: "Verify identity (e-KYC)" })
    expect(within(verify).getByLabelText("Name")).toHaveValue("Jalal Uddin")
    await user.type(within(verify).getByLabelText("NID number"), "2854106397")
    await user.type(within(verify).getByLabelText("Date of birth"), "1990-06-05")
    await user.click(within(verify).getByRole("button", { name: "Verify" }))
    await user.click(await within(verify).findByRole("button", { name: "Use this identity" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByRole("region", { name: "Identity" })).toHaveTextContent("NID •••• 6397")

    await user.click(screen.getByRole("button", { name: "Add signature" }))
    const sign = await screen.findByRole("dialog", { name: "Add the prisoner's signature" })
    await user.click(within(sign).getByRole("button", { name: "Add signature" }))
    expect(within(sign).getByText("Sign in the box, or upload a scan.")).toBeInTheDocument()
    await user.upload(within(sign).getByLabelText("Scanned signature or thumbprint"), scan())
    await user.click(within(sign).getByRole("button", { name: "Add signature" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByRole("region", { name: "Signature" })).toHaveTextContent("Signed")
  })

  it("refuses a scan that is not an image, or too large", async () => {
    const { user } = renderApp({ path: "/applications/new?prisoner=1" })
    await screen.findByRole("heading", { name: "Identity (e-KYC)" })
    await user.type(screen.getByLabelText("NID number"), "2854106397")
    await user.type(screen.getByLabelText("Date of birth"), "1990-06-05")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    await user.click(await screen.findByRole("button", { name: "Next" }))
    await user.click(await screen.findByRole("radio", { name: "Appeal against a conviction" }))
    await user.type(
      screen.getByLabelText("What help is needed, and why"),
      "Convicted last month; he wants to appeal.",
    )
    await user.click(screen.getByRole("button", { name: "Next" }))
    const input = await screen.findByLabelText("Scanned signature or thumbprint")
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" })
    await user.upload(input, big)
    expect(screen.getByText("The image must be 2 MB or smaller.")).toBeInTheDocument()
    // The file picker's filter can be bypassed (e.g. "All files"): the type is checked again.
    const anyFile = userEvent.setup({ applyAccept: false })
    await anyFile.upload(input, new File(["%PDF"], "scan.pdf", { type: "application/pdf" }))
    expect(screen.getByText("Choose a PNG or JPEG image.")).toBeInTheDocument()
    // Nothing usable chosen: the step can still be skipped.
    expect(screen.getByRole("button", { name: "Skip: add it later" })).toBeInTheDocument()
  })
})
