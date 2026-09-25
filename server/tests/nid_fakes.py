"""A small in-memory NID registry for tests: the Karim family and two respondents."""

from datetime import date

from app.agents.spoken import name_similarity
from app.services.nid_registry import Citizen, Family, Localized


def person(
    nid: str,
    name: tuple[str, str],
    *,
    father: tuple[str, str, str | None],
    mother: tuple[str, str, str | None],
    born: str,
    gender: str,
    district: tuple[str, str] = ("Rangpur", "রংপুর"),
    upazila: tuple[str, str] = ("Mithapukur", "মিঠাপুকুর"),
    sims: tuple[str, ...] = (),
) -> Citizen:
    place = {
        "village": {"en": "Balarhat", "bn": "বালারহাট"},
        "upazila": {"en": upazila[0], "bn": upazila[1]},
        "district": {"en": district[0], "bn": district[1]},
    }
    return Citizen.model_validate(
        {
            "nid": nid,
            "name": {"en": name[0], "bn": name[1]},
            "father": {"name": {"en": father[0], "bn": father[1]}, "nid": father[2]},
            "mother": {"name": {"en": mother[0], "bn": mother[1]}, "nid": mother[2]},
            "date_of_birth": born,
            "gender": gender,
            "permanent_address": place,
            "present_address": place,
            "sims": [
                {"msisdn": s, "operator": "Grameenphone", "registered_on": "2019-01-01"}
                for s in sims
            ],
        }
    )


KARIM_F = ("Md. Abdul Karim", "মোঃ আব্দুল করিম", "4600000001")
RAHIMA_M = ("Rahima Khatun", "রহিমা খাতুন", "4600000002")

KARIM = person(
    "4600000001", KARIM_F[:2], father=("Abdul Jabbar", "আব্দুল জব্বার", None),
    mother=("Jobeda Khatun", "জবেদা খাতুন", None), born="1962-03-10", gender="male",
    sims=("01712000001",),
)  # fmt: skip
RAHIMA = person(
    "4600000002", RAHIMA_M[:2], father=("Nurul Haque", "নুরুল হক", None),
    mother=("Amena Begum", "আমেনা বেগম", None), born="1968-11-20", gender="female",
)  # fmt: skip
RAFIQ = person(
    "4600000003", ("Rafiqul Islam", "রফিকুল ইসলাম"), father=KARIM_F, mother=RAHIMA_M,
    born="1994-06-02", gender="male", sims=("01811223344",),
)  # fmt: skip
SHIRIN = person(
    "4600000004", ("Shirin Akter", "শিরিন আক্তার"), father=KARIM_F, mother=RAHIMA_M,
    born="1998-01-15", gender="female", sims=("01711000222",),
)  # fmt: skip
KAMAL = person(
    "4600000010", ("Kamal Hossain", "কামাল হোসেন"), father=("Abdul Hamid", "আব্দুল হামিদ", None),
    mother=("Sufia Begum", "সুফিয়া বেগম", None), born="1975-05-05", gender="male",
    district=("Gaibandha", "গাইবান্ধা"), upazila=("Gobindaganj", "গোবিন্দগঞ্জ"),
    sims=("01911000001", "01611000002"),
)  # fmt: skip
JALAL = person(
    "4600000011", ("Jalal Uddin", "জালাল উদ্দিন"), father=("Kashem Ali", "কাশেম আলী", None),
    mother=("Rokeya Begum", "রোকেয়া বেগম", None), born="1990-02-02", gender="male",
    upazila=("Pirgachha", "পীরগাছা"), sims=("01722000333",),
)  # fmt: skip

EVERYONE = (KARIM, RAHIMA, RAFIQ, SHIRIN, KAMAL, JALAL)


def similar(said: str, recorded: Localized) -> bool:
    return name_similarity(said, recorded.en, recorded.bn) >= 85


class FakeRegistry:
    def __init__(self, citizens: tuple[Citizen, ...] = EVERYONE, *, down: bool = False):
        self.citizens = {c.nid: c for c in citizens}
        self.down = down
        self.calls: list[str] = []

    def match(
        self,
        *,
        name: str,
        father_name: str | None = None,
        mother_name: str | None = None,
        date_of_birth: date | None = None,
        permanent_district: str | None = None,
        district: str | None = None,
    ) -> list[Citizen] | None:
        self.calls.append("match")
        if self.down:
            return None

        def fits(c: Citizen) -> bool:
            homes = {c.permanent_address.district.en, c.present_address.district.en}
            return (
                similar(name, c.name)
                and (father_name is None or similar(father_name, c.father.name))
                and (mother_name is None or similar(mother_name, c.mother.name))
                and (date_of_birth is None or c.date_of_birth == date_of_birth)
                and (permanent_district in (None, c.permanent_address.district.en))
                and (district is None or district in homes)
            )

        return [c for c in self.citizens.values() if fits(c)]

    def family(self, nid: str) -> Family | None:
        self.calls.append("family")
        if self.down:
            return None
        me = self.citizens[nid]
        parents = {me.father.nid, me.mother.nid} - {None}
        return Family(
            father=self.citizens.get(me.father.nid or ""),
            mother=self.citizens.get(me.mother.nid or ""),
            siblings=[
                c
                for c in self.citizens.values()
                if c.nid != nid and parents & {c.father.nid, c.mother.nid}
            ],
        )

    def sim_owner(self, msisdn: str) -> str | None:
        return next((c.nid for c in self.citizens.values() if msisdn in c.phones), "")
