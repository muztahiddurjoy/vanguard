import type { Gender } from "@/data/types"

/**
 * A few citizens of the NID registry (nid-server/app/data/citizens.json), so e-KYC works
 * without a backend. With one, the server asks the real registry. The address is the
 * present address, as the server fills an application from it.
 */
export interface SampleCitizen {
  nid: string
  dateOfBirth: string
  name: string
  nameBn: string
  fatherName: string
  fatherNameBn: string
  motherName: string | null
  gender: Gender
  village: string | null
  upazila: string
  district: string
}

export const SAMPLE_CITIZENS: SampleCitizen[] = [
  {
    nid: "2854106397",
    dateOfBirth: "1990-06-05",
    name: "Jalal Uddin",
    nameBn: "জালাল উদ্দিন",
    fatherName: "Abdus Sattar",
    fatherNameBn: "আব্দুস সাত্তার",
    motherName: "Jamela Khatun",
    gender: "male",
    village: "Shyampur",
    upazila: "Pirgachha",
    district: "Rangpur",
  },
  {
    nid: "5519273046",
    dateOfBirth: "2000-04-03",
    name: "Sohel Rana",
    nameBn: "সোহেল রানা",
    fatherName: "Abdul Hamid",
    fatherNameBn: "আব্দুল হামিদ",
    motherName: "Nurjahan Begum",
    gender: "male",
    village: "Zirabo",
    upazila: "Savar",
    district: "Dhaka",
  },
  {
    nid: "8347261590",
    dateOfBirth: "1963-06-14",
    name: "Mofiz Uddin",
    nameBn: "মফিজ উদ্দিন",
    fatherName: "Kofil Uddin",
    fatherNameBn: "কফিল উদ্দিন",
    motherName: null,
    gender: "male",
    village: null,
    upazila: "Rajarhat",
    district: "Kurigram",
  },
  {
    nid: "5068247712",
    dateOfBirth: "1990-03-12",
    name: "Kamal Hossain",
    nameBn: "কামাল হোসেন",
    fatherName: "Nurul Islam",
    fatherNameBn: "নুরুল ইসলাম",
    motherName: null,
    gender: "male",
    village: null,
    upazila: "Mithapukur",
    district: "Rangpur",
  },
  {
    nid: "6390284417",
    dateOfBirth: "1992-02-11",
    name: "Rahima Begum",
    nameBn: "রহিমা বেগম",
    fatherName: "Abdul Hakim",
    fatherNameBn: "আব্দুল হাকিম",
    motherName: "Amena Khatun",
    gender: "female",
    village: "Balarhat",
    upazila: "Mithapukur",
    district: "Rangpur",
  },
]

export function findCitizen(nid: string) {
  return SAMPLE_CITIZENS.find((c) => c.nid === nid)
}
