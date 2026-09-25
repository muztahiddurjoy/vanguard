"""FastAPI application factory and routes.

Stands in for the Election Commission's NID verification service. The legal aid
backend asks it three things: is this caller who they say they are (match), who
are their registered relatives (family), and whose NID is this SIM registered
under (sims). Everything under /v1 needs the shared API key; /health is open for
probes.
"""

import secrets
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, status

from app.config import Settings, get_settings
from app.registry import Registry, load_registry, provided_details
from app.schemas import Citizen, Family, Health, MatchRequest, MatchResponse, SimOwner

# Details required besides the name, so the match endpoint cannot be used to find
# people by name alone.
MIN_DETAILS = 2

NO_CITIZEN = "No citizen with that NID"


def get_registry(settings: Settings = Depends(get_settings)) -> Registry:
    return load_registry(settings.data_file)


def require_api_key(
    x_api_key: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Reject the request unless it carries the configured key.

    With no NID_API_KEY configured (local development) every request passes.
    """
    expected = settings.nid_api_key
    if not expected:
        return
    if not secrets.compare_digest((x_api_key or "").encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid API key")


router = APIRouter(prefix="/v1", dependencies=[Depends(require_api_key)])


def _citizen_or_404(registry: Registry, nid: str) -> Citizen:
    citizen = registry.get(nid)
    if citizen is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NO_CITIZEN)
    return citizen


@router.post("/citizens/match", tags=["citizens"])
def match_citizens(
    body: MatchRequest,
    registry: Registry = Depends(get_registry),
    settings: Settings = Depends(get_settings),
) -> MatchResponse:
    if len(provided_details(body)) < MIN_DETAILS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Give at least two details besides the name"
        )
    matches = registry.match(body, settings.name_match_threshold)
    return MatchResponse(matches=matches[: body.limit], unique=len(matches) == 1)


@router.get("/citizens/{nid}", tags=["citizens"])
def get_citizen(nid: str, registry: Registry = Depends(get_registry)) -> Citizen:
    return _citizen_or_404(registry, nid)


@router.get("/citizens/{nid}/family", tags=["citizens"])
def get_family(nid: str, registry: Registry = Depends(get_registry)) -> Family:
    return registry.family(_citizen_or_404(registry, nid))


@router.get("/sims/{msisdn}", tags=["sims"])
def get_sim(msisdn: str, registry: Registry = Depends(get_registry)) -> SimOwner:
    found = registry.sim(msisdn)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SIM not registered")
    sim, owner = found
    return SimOwner(
        msisdn=sim.msisdn, nid=owner.nid, operator=sim.operator, registered_on=sim.registered_on
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Resolve through overrides so the startup checks see the settings the routes see.
    settings: Settings = app.dependency_overrides.get(get_settings, get_settings)()
    if settings.environment == "production" and not settings.nid_api_key:
        raise RuntimeError("Set NID_API_KEY before running in production")
    load_registry(settings.data_file)  # invalid data fails here, not on the first request
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    app.include_router(router)

    @app.get("/health", tags=["meta"])
    def health(registry: Registry = Depends(get_registry)) -> Health:
        return Health(citizens=len(registry))

    return app


app = create_app()
