"""The district's Union Digital Centres (UDCs), which can reach people in person.

A party who keeps missing mediation may not be reading the SMS (a shared phone,
no phone, or they cannot read). Their UDC is sent the next date to pass on
(``services.mediation``). One UDC per upazila is listed for now; a party is
matched by the upazila on their record.

The entrepreneurs' numbers are placeholders: set ``SMS_DRY_RUN`` or
``SMS_ALLOWLIST`` until the real ones are entered. A UDC app would name the
centre in ``X-Udc-Id``, which must be on this roster.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Udc:
    id: str
    # The union the centre is in, and its upazila.
    name: str
    name_bn: str
    upazila: str
    upazila_bn: str
    entrepreneur: str
    entrepreneur_bn: str
    phone: str

    @property
    def actor(self) -> str:
        return f"udc:{self.id}"

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "nameBn": self.name_bn,
            "upazila": self.upazila,
            "upazilaBn": self.upazila_bn,
            "entrepreneur": self.entrepreneur,
            "entrepreneurBn": self.entrepreneur_bn,
        }


UDCS: tuple[Udc, ...] = (
    Udc(
        "UDC-RSD",
        "Mominpur Union Digital Centre",
        "মমিনপুর ইউনিয়ন ডিজিটাল সেন্টার",
        "Rangpur Sadar",
        "রংপুর সদর",
        "Md. Sajjad Hossain",
        "মো. সাজ্জাদ হোসেন",
        "01700000101",
    ),
    Udc(
        "UDC-MTP",
        "Latibpur Union Digital Centre",
        "লতিবপুর ইউনিয়ন ডিজিটাল সেন্টার",
        "Mithapukur",
        "মিঠাপুকুর",
        "Rehana Parvin",
        "রেহানা পারভীন",
        "01700000102",
    ),
    Udc(
        "UDC-PGC",
        "Tambulpur Union Digital Centre",
        "তাম্বুলপুর ইউনিয়ন ডিজিটাল সেন্টার",
        "Pirgachha",
        "পীরগাছা",
        "Md. Anisur Rahman",
        "মো. আনিসুর রহমান",
        "01700000103",
    ),
    Udc(
        "UDC-BDG",
        "Kalupara Union Digital Centre",
        "কালুপাড়া ইউনিয়ন ডিজিটাল সেন্টার",
        "Badarganj",
        "বদরগঞ্জ",
        "Md. Mahbub Alam",
        "মো. মাহবুব আলম",
        "01700000104",
    ),
    Udc(
        "UDC-PGJ",
        "Chatra Union Digital Centre",
        "চতরা ইউনিয়ন ডিজিটাল সেন্টার",
        "Pirganj",
        "পীরগঞ্জ",
        "Shamima Nasrin",
        "শামীমা নাসরিন",
        "01700000105",
    ),
    Udc(
        "UDC-GNG",
        "Kolkonda Union Digital Centre",
        "কোলকোন্দ ইউনিয়ন ডিজিটাল সেন্টার",
        "Gangachara",
        "গংগাচড়া",
        "Md. Rashedul Islam",
        "মো. রাশেদুল ইসলাম",
        "01700000106",
    ),
    Udc(
        "UDC-KAU",
        "Tepamadhupur Union Digital Centre",
        "টেপামধুপুর ইউনিয়ন ডিজিটাল সেন্টার",
        "Kaunia",
        "কাউনিয়া",
        "Md. Faruk Hossain",
        "মো. ফারুক হোসেন",
        "01700000107",
    ),
    Udc(
        "UDC-TRG",
        "Alampur Union Digital Centre",
        "আলমপুর ইউনিয়ন ডিজিটাল সেন্টার",
        "Taraganj",
        "তারাগঞ্জ",
        "Nargis Akter",
        "নার্গিস আক্তার",
        "01700000108",
    ),
)

_BY_ID = {udc.id: udc for udc in UDCS}
_BY_UPAZILA = {udc.upazila.casefold(): udc for udc in UDCS}
_BY_UPAZILA.update({udc.upazila_bn: udc for udc in UDCS})


def get_udc(udc_id: str) -> Udc | None:
    return _BY_ID.get(udc_id.strip().upper())


def udc_for_upazila(upazila: str | None) -> Udc | None:
    """The UDC serving an upazila, by its English or Bangla name."""
    if not upazila or not upazila.strip():
        return None
    name = upazila.strip()
    return _BY_UPAZILA.get(name.casefold()) or _BY_UPAZILA.get(name)
