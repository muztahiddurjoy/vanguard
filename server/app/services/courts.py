"""The district's courts, and the court staff who use court-dashboard.

The roster is kept here and matches court-dashboard's and prison-dashboard's
own lists (``src/data/courts.ts``). Adding a court or a member of staff is not
available from the API yet.

Staff sign in on court-dashboard, as officers and lawyers do on theirs:
requests name them in ``X-Court-Staff-Id``, which must be on this roster.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Court:
    id: str
    name: str
    name_bn: str
    # "sessions", "magistrate", "tribunal", "family" or "labour".
    kind: str

    def ref(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "nameBn": self.name_bn, "kind": self.kind}


@dataclass(frozen=True)
class CourtStaff:
    id: str
    name: str
    name_bn: str
    designation: str
    designation_bn: str
    court_id: str

    @property
    def court(self) -> Court:
        return COURTS_BY_ID[self.court_id]

    @property
    def actor(self) -> str:
        """How they appear in the audit ledger."""
        return f"court:{self.id}"

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "nameBn": self.name_bn,
            "designation": self.designation,
            "designationBn": self.designation_bn,
            "court": self.court.ref(),
        }


COURTS: tuple[Court, ...] = (
    Court(
        "RNG-DSJ",
        "District and Sessions Judge Court, Rangpur",
        "জেলা ও দায়রা জজ আদালত, রংপুর",
        "sessions",
    ),
    Court(
        "RNG-CJM",
        "Chief Judicial Magistrate Court, Rangpur",
        "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
        "magistrate",
    ),
    Court(
        "RNG-NST",
        "Nari o Shishu Nirjatan Daman Tribunal-1, Rangpur",
        "নারী ও শিশু নির্যাতন দমন ট্রাইব্যুনাল-১, রংপুর",
        "tribunal",
    ),
    Court("RNG-FAM", "Family Court, Rangpur Sadar", "পারিবারিক আদালত, রংপুর সদর", "family"),
    Court("RNG-LAB", "Divisional Labour Court, Rangpur", "বিভাগীয় শ্রম আদালত, রংপুর", "labour"),
)

COURTS_BY_ID = {court.id: court for court in COURTS}

COURT_STAFF: tuple[CourtStaff, ...] = (
    CourtStaff(
        "CS-11", "Md. Abdul Hakim", "মো. আব্দুল হাকিম", "Bench Assistant", "বেঞ্চ সহকারী", "RNG-CJM"
    ),
    CourtStaff("CS-14", "Farzana Yeasmin", "ফারজানা ইয়াসমিন", "Sheristadar", "সেরেস্তাদার", "RNG-NST"),
    CourtStaff(
        "CS-17", "Md. Rezaul Karim", "মো. রেজাউল করিম", "Bench Assistant", "বেঞ্চ সহকারী", "RNG-DSJ"
    ),
    CourtStaff("CS-21", "Anjuman Ara", "আঞ্জুমান আরা", "Bench Assistant", "বেঞ্চ সহকারী", "RNG-FAM"),
    CourtStaff(
        "CS-25", "Md. Nazmul Huda", "মো. নাজমুল হুদা", "Bench Assistant", "বেঞ্চ সহকারী", "RNG-LAB"
    ),
)

_STAFF_BY_ID = {staff.id: staff for staff in COURT_STAFF}


def get_court(court_id: str) -> Court | None:
    return COURTS_BY_ID.get(court_id.strip().upper())


def get_court_staff(staff_id: str) -> CourtStaff | None:
    return _STAFF_BY_ID.get(staff_id.strip().upper())
