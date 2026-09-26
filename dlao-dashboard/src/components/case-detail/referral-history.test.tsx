import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ReferralHistory } from "@/components/case-detail/referral-history"
import { INITIAL_CASES } from "@/data/cases"
import { I18nProvider } from "@/i18n/provider"

const nabila = INITIAL_CASES.find((c) => c.id === "APP-2026-012")!

describe("ReferralHistory", () => {
  it("offers Escalate to Chief Officer after two bounces while another step comes first", async () => {
    const onEscalate = vi.fn()
    render(
      <I18nProvider initialLang="en">
        <ReferralHistory
          legalCase={{ ...nabila, actions: ["reviewTriage", "escalateJurisdiction"] }}
          onEscalate={onEscalate}
        />
      </I18nProvider>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Escalate to Chief Officer" }))
    expect(onEscalate).toHaveBeenCalledOnce()
  })

  it("does not offer it again once escalated", () => {
    render(
      <I18nProvider initialLang="en">
        <ReferralHistory
          legalCase={{ ...nabila, actions: [], flags: ["sensitive", "escalated"] }}
          onEscalate={() => {}}
        />
      </I18nProvider>,
    )
    expect(
      screen.queryByRole("button", { name: "Escalate to Chief Officer" }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "Escalated to the Chief Legal Aid Officer. Their decision binds every office.",
      ),
    ).toBeInTheDocument()
  })
})
