import type { Officer } from "@/data/types"

/** The demo officer account. Every sign-in uses this profile. */
export const DEMO_OFFICER: Officer = {
  id: "DLAO-RGP-0142",
  name: { en: "Farhana Rahman", bn: "ফারহানা রহমান" },
  role: { en: "District Legal Aid Officer", bn: "জেলা লিগ্যাল এইড অফিসার" },
  district: { en: "Rangpur", bn: "রংপুর" },
  office: {
    en: "District Legal Aid Office, Judge Court Building, Rangpur",
    bn: "জেলা লিগ্যাল এইড অফিস, জজ কোর্ট ভবন, রংপুর",
  },
  // Reserved example domain: this is not a real address.
  email: "farhana.rahman@dlas.example",
  phone: "01711-000142",
  initials: "FR",
  joinedAt: "2021-03-01",
}

export const DEMO_PASSWORD = "demo1234"
export const MIN_PASSWORD_LENGTH = 4
