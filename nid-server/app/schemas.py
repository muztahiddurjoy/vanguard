"""Request and response models; the same models validate the citizens file.

Records are parsed strictly (unknown keys are rejected) so a typo in the data file
fails at startup instead of silently dropping a field from every response.
"""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

MSISDN_PATTERN = r"^01[3-9]\d{8}$"
# Smart-card NIDs have 10 digits; older laminated cards 13, or 17 with the birth year.
NID_PATTERN = r"^\d{10}(\d{3}|\d{7})?$"

Operator = Literal["Grameenphone", "Robi", "Airtel", "Banglalink", "Teletalk"]


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Localized(Record):
    en: str = Field(min_length=1)
    bn: str = Field(min_length=1)


class Address(Record):
    village: Localized
    upazila: Localized
    district: Localized


class PersonRef(Record):
    name: Localized
    # Null when the person is not in this registry (for example, an older
    # generation registered before NIDs were issued).
    nid: str | None = Field(default=None, pattern=NID_PATTERN)


class Sim(Record):
    msisdn: str = Field(pattern=MSISDN_PATTERN)
    operator: Operator
    registered_on: date


class Citizen(Record):
    nid: str = Field(pattern=NID_PATTERN)
    name: Localized
    father: PersonRef
    mother: PersonRef
    spouse: PersonRef | None = None
    date_of_birth: date
    gender: Literal["male", "female"]
    permanent_address: Address
    present_address: Address
    sims: list[Sim] = Field(default_factory=list)


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    citizens: int


Name = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
District = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


class MatchRequest(BaseModel):
    """Blank strings count as not given, so they neither match nor count as a detail."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    father_name: Name | None = None
    mother_name: Name | None = None
    date_of_birth: date | None = None
    permanent_district: District | None = Field(
        default=None, description="Must match the permanent address district."
    )
    district: District | None = Field(
        default=None, description="Matches either the permanent or the present address district."
    )
    limit: int = Field(default=5, ge=1, le=10)


class Match(BaseModel):
    citizen: Citizen
    score: float = Field(description="Mean of the name-field scores, 0-100.")
    matched: list[str] = Field(description="Every field that was checked; all of them matched.")


class MatchResponse(BaseModel):
    matches: list[Match]
    unique: bool = Field(description="True when exactly one citizen matched.")


class Family(BaseModel):
    father: Citizen | None
    mother: Citizen | None
    spouse: Citizen | None
    siblings: list[Citizen]
    children: list[Citizen]


class SimOwner(BaseModel):
    msisdn: str
    nid: str
    operator: str
    registered_on: date
