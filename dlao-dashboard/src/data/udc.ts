import type { Localized, Udc } from "@/data/types"

// One Union Digital Centre per upazila of Rangpur, as the server lists them
// (server/app/services/udc.py). A party is matched by the upazila on record.

export const UDCS: Udc[] = [
  {
    id: "UDC-RSD",
    name: { en: "Mominpur Union Digital Centre", bn: "মমিনপুর ইউনিয়ন ডিজিটাল সেন্টার" },
    upazila: { en: "Rangpur Sadar", bn: "রংপুর সদর" },
    entrepreneur: { en: "Md. Sajjad Hossain", bn: "মো. সাজ্জাদ হোসেন" },
  },
  {
    id: "UDC-MTP",
    name: { en: "Latibpur Union Digital Centre", bn: "লতিবপুর ইউনিয়ন ডিজিটাল সেন্টার" },
    upazila: { en: "Mithapukur", bn: "মিঠাপুকুর" },
    entrepreneur: { en: "Rehana Parvin", bn: "রেহানা পারভীন" },
  },
  {
    id: "UDC-PGC",
    name: { en: "Tambulpur Union Digital Centre", bn: "তাম্বুলপুর ইউনিয়ন ডিজিটাল সেন্টার" },
    upazila: { en: "Pirgachha", bn: "পীরগাছা" },
    entrepreneur: { en: "Md. Anisur Rahman", bn: "মো. আনিসুর রহমান" },
  },
  {
    id: "UDC-BDG",
    name: { en: "Kalupara Union Digital Centre", bn: "কালুপাড়া ইউনিয়ন ডিজিটাল সেন্টার" },
    upazila: { en: "Badarganj", bn: "বদরগঞ্জ" },
    entrepreneur: { en: "Md. Mahbub Alam", bn: "মো. মাহবুব আলম" },
  },
  {
    id: "UDC-PGJ",
    name: { en: "Chatra Union Digital Centre", bn: "চতরা ইউনিয়ন ডিজিটাল সেন্টার" },
    upazila: { en: "Pirganj", bn: "পীরগঞ্জ" },
    entrepreneur: { en: "Shamima Nasrin", bn: "শামীমা নাসরিন" },
  },
  {
    id: "UDC-GNG",
    name: { en: "Kolkonda Union Digital Centre", bn: "কোলকোন্দ ইউনিয়ন ডিজিটাল সেন্টার" },
    upazila: { en: "Gangachara", bn: "গংগাচড়া" },
    entrepreneur: { en: "Md. Rashedul Islam", bn: "মো. রাশেদুল ইসলাম" },
  },
  {
    id: "UDC-KAU",
    name: { en: "Tepamadhupur Union Digital Centre", bn: "টেপামধুপুর ইউনিয়ন ডিজিটাল সেন্টার" },
    upazila: { en: "Kaunia", bn: "কাউনিয়া" },
    entrepreneur: { en: "Md. Faruk Hossain", bn: "মো. ফারুক হোসেন" },
  },
  {
    id: "UDC-TRG",
    name: { en: "Alampur Union Digital Centre", bn: "আলমপুর ইউনিয়ন ডিজিটাল সেন্টার" },
    upazila: { en: "Taraganj", bn: "তারাগঞ্জ" },
    entrepreneur: { en: "Nargis Akter", bn: "নার্গিস আক্তার" },
  },
]

/** The UDC serving an upazila, by its English or Bangla name. */
export function udcForUpazila(upazila?: Localized): Udc | undefined {
  if (!upazila) return undefined
  const en = upazila.en.trim().toLocaleLowerCase()
  return UDCS.find(
    (u) => u.upazila.en.toLocaleLowerCase() === en || u.upazila.bn === upazila.bn.trim(),
  )
}
