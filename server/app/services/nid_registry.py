"""Client for the NID registry (see ``nid-server/``).

Bangladesh's National ID database holds each citizen's name, parents,
date of birth, addresses, and every SIM registered under their NID. Intake
uses it to confirm a caller's identity from answers only they should know
(father's name, permanent district, date of birth) or, when they cannot
answer, from the SIM they are calling from; to confirm a family member they
are applying for; and to find the registered numbers of the person a case
is filed against.

Every call returns ``None`` when the registry cannot be reached, which is
different from "no match" (an empty result): callers are then taken through
intake unverified instead of being asked the security questions again.
"""

import logging
from datetime import date
from typing import Protocol

import httpx
from pydantic import BaseModel, ValidationError

from app.config import Settings, get_settings

log = logging.getLogger(__name__)


class Localized(BaseModel):
    en: str
    bn: str


class Address(BaseModel):
    village: Localized
    upazila: Localized
    district: Localized


class PersonRef(BaseModel):
    name: Localized
    nid: str | None = None


class Sim(BaseModel):
    msisdn: str
    operator: str
    registered_on: date


class Citizen(BaseModel):
    nid: str
    name: Localized
    father: PersonRef
    mother: PersonRef
    spouse: PersonRef | None = None
    date_of_birth: date
    gender: str
    permanent_address: Address
    present_address: Address
    sims: list[Sim] = []

    @property
    def phones(self) -> list[str]:
        return [s.msisdn for s in self.sims]

    def age_on(self, day: date) -> int:
        born = self.date_of_birth
        return day.year - born.year - ((day.month, day.day) < (born.month, born.day))


class Family(BaseModel):
    father: Citizen | None = None
    mother: Citizen | None = None
    spouse: Citizen | None = None
    siblings: list[Citizen] = []
    children: list[Citizen] = []


class NidRegistry(Protocol):
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
        """Citizens matching every given detail (name plus at least two others)."""
        ...

    def citizen(self, nid: str) -> Citizen | None:
        """The record for an NID the registry gave us (from ``sim_owner``, say)."""
        ...

    def family(self, nid: str) -> Family | None: ...

    def sim_owner(self, msisdn: str) -> str | None:
        """The NID a SIM is registered to; ``""`` if it is not registered."""
        ...


class HttpNidRegistry:
    TIMEOUT_SECONDS = 5.0  # a caller is waiting on the line

    def __init__(self, settings: Settings | None = None, http: httpx.Client | None = None):
        self.settings = settings or get_settings()
        self._http = http

    def _get(self, path: str) -> httpx.Response | None:
        return self._request("GET", path)

    def _request(self, method: str, path: str, json: object = None) -> httpx.Response | None:
        url = self.settings.nid_server_url.rstrip("/") + path
        headers = {"X-API-Key": self.settings.nid_server_api_key}
        try:
            if self._http is not None:
                resp = self._http.request(
                    method, url, json=json, headers=headers, timeout=self.TIMEOUT_SECONDS
                )
            else:
                with httpx.Client(timeout=self.TIMEOUT_SECONDS) as client:
                    resp = client.request(method, url, json=json, headers=headers)
        except httpx.HTTPError as exc:
            log.warning("NID registry unreachable: %s", exc)
            return None
        if resp.status_code >= 500 or resp.status_code in (401, 403):
            log.warning("NID registry answered %s for %s", resp.status_code, path)
            return None
        return resp

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
        body = {
            "name": name,
            "father_name": father_name,
            "mother_name": mother_name,
            "date_of_birth": date_of_birth.isoformat() if date_of_birth else None,
            "permanent_district": permanent_district,
            "district": district,
        }
        resp = self._request("POST", "/v1/citizens/match", json=body)
        if resp is None:
            return None
        if resp.status_code != 200:
            log.error("NID match refused (%s): %s", resp.status_code, resp.text[:200])
            return []
        try:
            return [Citizen.model_validate(m["citizen"]) for m in resp.json()["matches"]]
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            log.error("NID match returned an unexpected body: %s", exc)
            return None

    def citizen(self, nid: str) -> Citizen | None:
        resp = self._get(f"/v1/citizens/{nid}")
        if resp is None:
            return None
        if resp.status_code == 404:
            log.error("The NID registry does not hold an NID it gave for a SIM")
            return None
        try:
            return Citizen.model_validate(resp.json())
        except (ValueError, ValidationError) as exc:
            log.error("NID citizen lookup returned an unexpected body: %s", exc)
            return None

    def family(self, nid: str) -> Family | None:
        resp = self._get(f"/v1/citizens/{nid}/family")
        if resp is None:
            return None
        if resp.status_code == 404:
            return Family()
        try:
            return Family.model_validate(resp.json())
        except (ValueError, ValidationError) as exc:
            log.error("NID family returned an unexpected body: %s", exc)
            return None

    def sim_owner(self, msisdn: str) -> str | None:
        resp = self._get(f"/v1/sims/{msisdn}")
        if resp is None:
            return None
        if resp.status_code == 404:
            return ""
        try:
            return str(resp.json()["nid"])
        except (KeyError, ValueError) as exc:
            log.error("NID SIM lookup returned an unexpected body: %s", exc)
            return None


def default_registry() -> NidRegistry | None:
    """The configured registry, or None when NID_SERVER_URL is not set."""
    settings = get_settings()
    return HttpNidRegistry(settings) if settings.nid_server_url else None
