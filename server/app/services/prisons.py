"""The jails whose staff use prison-dashboard, and those staff.

The roster is kept here and matches prison-dashboard's own list
(``src/data/prisons.ts``). Adding a jail or a member of staff is not available
from the API yet.

Staff sign in on prison-dashboard: requests name them in
``X-Prison-Staff-Id``, which must be on this roster.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Prison:
    id: str
    name: str
    name_bn: str

    def ref(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "nameBn": self.name_bn}


@dataclass(frozen=True)
class PrisonStaff:
    id: str
    name: str
    name_bn: str
    designation: str
    designation_bn: str
    prison_id: str

    @property
    def prison(self) -> Prison:
        return PRISONS_BY_ID[self.prison_id]

    @property
    def actor(self) -> str:
        """How they appear in the audit ledger."""
        return f"prison:{self.id}"

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "nameBn": self.name_bn,
            "designation": self.designation,
            "designationBn": self.designation_bn,
            "prison": self.prison.ref(),
        }


PRISONS: tuple[Prison, ...] = (
    Prison("RNG-CJ", "Rangpur Central Jail", "রংপুর কেন্দ্রীয় কারাগার"),
    Prison("NIL-DJ", "Nilphamari District Jail", "নীলফামারী জেলা কারাগার"),
)

PRISONS_BY_ID = {prison.id: prison for prison in PRISONS}

PRISON_STAFF: tuple[PrisonStaff, ...] = (
    PrisonStaff(
        "JS-03", "Md. Golam Rabbani", "মো. গোলাম রব্বানী", "Deputy Jailer", "ডেপুটি জেলার", "RNG-CJ"
    ),
    PrisonStaff(
        "JS-08",
        "Nasima Khatun",
        "নাসিমা খাতুন",
        "Legal Aid Desk Officer",
        "লিগ্যাল এইড ডেস্ক কর্মকর্তা",
        "RNG-CJ",
    ),
    PrisonStaff("JS-12", "Md. Shafiqul Alam", "মো. শফিকুল আলম", "Jailer", "জেলার", "NIL-DJ"),
)

_STAFF_BY_ID = {staff.id: staff for staff in PRISON_STAFF}


def get_prison(prison_id: str) -> Prison | None:
    return PRISONS_BY_ID.get(prison_id.strip().upper())


def get_prison_staff(staff_id: str) -> PrisonStaff | None:
    return _STAFF_BY_ID.get(staff_id.strip().upper())
