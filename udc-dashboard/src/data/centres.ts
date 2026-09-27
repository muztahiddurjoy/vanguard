import type { Centre } from "@/data/types"

/**
 * The district's Union Digital Centres, one per upazila. They match the backend's
 * roster (server/app/services/udc.py); with a backend, sign-in is checked against the
 * server, and the centre a party belongs to is worked out there from their upazila.
 */
export const CENTRES: Centre[] = [
  {
    id: "UDC-RSD",
    name: "Mominpur Union Digital Centre",
    nameBn: "মমিনপুর ইউনিয়ন ডিজিটাল সেন্টার",
    upazila: "Rangpur Sadar",
    upazilaBn: "রংপুর সদর",
    entrepreneur: "Md. Sajjad Hossain",
    entrepreneurBn: "মো. সাজ্জাদ হোসেন",
  },
  {
    id: "UDC-MTP",
    name: "Latibpur Union Digital Centre",
    nameBn: "লতিবপুর ইউনিয়ন ডিজিটাল সেন্টার",
    upazila: "Mithapukur",
    upazilaBn: "মিঠাপুকুর",
    entrepreneur: "Rehana Parvin",
    entrepreneurBn: "রেহানা পারভীন",
  },
  {
    id: "UDC-PGC",
    name: "Tambulpur Union Digital Centre",
    nameBn: "তাম্বুলপুর ইউনিয়ন ডিজিটাল সেন্টার",
    upazila: "Pirgachha",
    upazilaBn: "পীরগাছা",
    entrepreneur: "Md. Anisur Rahman",
    entrepreneurBn: "মো. আনিসুর রহমান",
  },
  {
    id: "UDC-BDG",
    name: "Kalupara Union Digital Centre",
    nameBn: "কালুপাড়া ইউনিয়ন ডিজিটাল সেন্টার",
    upazila: "Badarganj",
    upazilaBn: "বদরগঞ্জ",
    entrepreneur: "Md. Mahbub Alam",
    entrepreneurBn: "মো. মাহবুব আলম",
  },
  {
    id: "UDC-PGJ",
    name: "Chatra Union Digital Centre",
    nameBn: "চতরা ইউনিয়ন ডিজিটাল সেন্টার",
    upazila: "Pirganj",
    upazilaBn: "পীরগঞ্জ",
    entrepreneur: "Shamima Nasrin",
    entrepreneurBn: "শামীমা নাসরিন",
  },
  {
    id: "UDC-GNG",
    name: "Kolkonda Union Digital Centre",
    nameBn: "কোলকোন্দ ইউনিয়ন ডিজিটাল সেন্টার",
    upazila: "Gangachara",
    upazilaBn: "গংগাচড়া",
    entrepreneur: "Md. Rashedul Islam",
    entrepreneurBn: "মো. রাশেদুল ইসলাম",
  },
  {
    id: "UDC-KAU",
    name: "Tepamadhupur Union Digital Centre",
    nameBn: "টেপামধুপুর ইউনিয়ন ডিজিটাল সেন্টার",
    upazila: "Kaunia",
    upazilaBn: "কাউনিয়া",
    entrepreneur: "Md. Faruk Hossain",
    entrepreneurBn: "মো. ফারুক হোসেন",
  },
  {
    id: "UDC-TRG",
    name: "Alampur Union Digital Centre",
    nameBn: "আলমপুর ইউনিয়ন ডিজিটাল সেন্টার",
    upazila: "Taraganj",
    upazilaBn: "তারাগঞ্জ",
    entrepreneur: "Nargis Akter",
    entrepreneurBn: "নার্গিস আক্তার",
  },
]

export function findCentre(id: string): Centre | undefined {
  const key = id.trim().toUpperCase()
  return CENTRES.find((c) => c.id === key)
}

/** The server records who acted as "udc:UDC-MTP": the centre, when on the roster. */
export function centreOfActor(actor: string): Centre | undefined {
  const [kind, id] = actor.split(":")
  return kind === "udc" && id ? findCentre(id) : undefined
}

/** The district every centre is in, which an application's address defaults to. */
export const DISTRICT = "Rangpur"

/** The two demo centres offered on the sign-in screen. */
export const DEMO_CENTRES = { mithapukur: "UDC-MTP", pirgachha: "UDC-PGC" } as const
export const DEMO_PASSWORD = "demo1234"
export const MIN_PASSWORD_LENGTH = 4

/** The number the applicant calls to follow their case, and the centre calls for help. */
export const HELPLINE_NUMBER = "16430"
