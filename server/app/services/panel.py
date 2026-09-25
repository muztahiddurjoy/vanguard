"""The district's panel lawyers: private lawyers the office pays to take legal aid cases.

The roster is kept here and matches the dashboards' own lists
(dlao-dashboard ``src/data/cases.ts``, lawyer-dashboard ``src/data/lawyers.ts``).
Adding a lawyer or taking one off the panel is not available from the API yet.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PanelLawyer:
    id: str
    name: str
    name_bn: str
    speciality: str
    speciality_bn: str
    # Bangladesh Bar Council enrolment, shown on the lawyer's own dashboard.
    enrolment: str
    # The year they joined the district legal aid panel.
    since: int

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "nameBn": self.name_bn,
            "speciality": self.speciality,
            "specialityBn": self.speciality_bn,
            "enrolment": self.enrolment,
            "since": self.since,
        }


PANEL_LAWYERS: tuple[PanelLawyer, ...] = (
    PanelLawyer(
        "LAW-07",
        "Adv. Shahidul Islam",
        "অ্যাড. শহিদুল ইসলাম",
        "Land and civil cases",
        "জমি ও দেওয়ানি মামলা",
        "BD-BAR-16427",
        2016,
    ),
    PanelLawyer(
        "LAW-12",
        "Adv. Nasrin Jahan",
        "অ্যাড. নাসরিন জাহান",
        "Family law and maintenance",
        "পারিবারিক আইন ও ভরণপোষণ",
        "BD-BAR-19402",
        2019,
    ),
    PanelLawyer(
        "LAW-15",
        "Adv. Mizanur Rahman",
        "অ্যাড. মিজানুর রহমান",
        "Labour and wage disputes",
        "শ্রম ও মজুরি বিরোধ",
        "BD-BAR-18311",
        2018,
    ),
    PanelLawyer(
        "LAW-21",
        "Adv. Taslima Akter",
        "অ্যাড. তাসলিমা আক্তার",
        "Violence against women and children",
        "নারী ও শিশু নির্যাতন",
        "BD-BAR-20185",
        2020,
    ),
    PanelLawyer(
        "LAW-24",
        "Adv. Rafiqul Hasan",
        "অ্যাড. রফিকুল হাসান",
        "Cyber crime and criminal cases",
        "সাইবার অপরাধ ও ফৌজদারি মামলা",
        "BD-BAR-22076",
        2022,
    ),
)

_BY_ID = {lawyer.id: lawyer for lawyer in PANEL_LAWYERS}


def get_lawyer(lawyer_id: str) -> PanelLawyer | None:
    return _BY_ID.get(lawyer_id.strip().upper())
