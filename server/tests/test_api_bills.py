"""A panel lawyer's bill for a closed case, and the court's decision on it."""

from sqlalchemy import select

from app.database import utcnow
from app.models import Case
from tests.records_helpers import CJM, NST, day, register_case
from tests.test_api_intake_dlao import create_moyuri
from tests.test_api_lawyer import OFFICER, assign

YEAR = utcnow().year
REF = f"APP-{YEAR}-001"
NUMBER = f"BILL-{YEAR}-001"
LAWYER = {"X-Lawyer-Id": "LAW-21"}
OTHER_LAWYER = {"X-Lawyer-Id": "LAW-07"}

LINES = [
    {"head": "appearance", "description": "Three hearings attended at the tribunal",
     "incurredOn": day(-40), "claimedTaka": 900},
    {"head": "drafting", "description": "Plaint and the application for maintenance",
     "incurredOn": day(-60), "claimedTaka": 1400},
    {"head": "courtFee", "description": "Court fee stamps on the plaint",
     "incurredOn": day(-60), "claimedTaka": 1200, "voucherRef": "CF-2026-114"},
    {"head": "vakalatnama", "description": "Vakalatnama stamp",
     "incurredOn": day(-60), "claimedTaka": 300, "voucherRef": "VK-2026-77"},
]  # fmt: skip
CLAIMED = 900 + 1400 + 1200 + 300


def close_case(client, ref: str = REF):
    r = client.post(
        f"/dlao/cases/{ref}/close",
        json={"outcome": "resolved", "note": "The court decreed maintenance; nothing is left."},
        headers=OFFICER,
    )
    assert r.status_code == 200, r.text
    return r.json()


def closed_case_with_a_court(client, *, link_court: bool = True) -> None:
    """Moyuri's case: given to LAW-21, heard by the CJM court, and closed."""
    create_moyuri(client)
    assign(client, "LAW-21")
    if link_court:
        court_case = register_case(client)
        r = client.post(
            f"/dlao/cases/{REF}/records",
            json={"court_case_id": court_case["id"]},
            headers=OFFICER,
        )
        assert r.status_code == 200, r.text
    close_case(client)


def start(client, headers: dict = LAWYER, **body):  # type: ignore[no-untyped-def]
    return client.post(f"/lawyer/cases/{REF}/bill", json=body, headers=headers)


def save(client, lines=None, headers: dict = LAWYER, **body):  # type: ignore[no-untyped-def]
    return client.put(
        f"/lawyer/bills/{NUMBER}",
        json={"lines": LINES if lines is None else lines, **body},
        headers=headers,
    )


def submit(client, headers: dict = LAWYER):  # type: ignore[no-untyped-def]
    return client.post(f"/lawyer/bills/{NUMBER}/submit", headers=headers)


def submitted_bill(client) -> dict:
    """A closed case billed in full and sent to the CJM court."""
    closed_case_with_a_court(client)
    assert start(client).status_code == 201
    assert save(client).status_code == 200
    r = submit(client)
    assert r.status_code == 200, r.text
    return r.json()


def verify(client, decisions: list[dict], headers: dict = CJM, **body):  # type: ignore[no-untyped-def]
    return client.post(
        f"/court/bills/{NUMBER}/verify", json={"lines": decisions, **body}, headers=headers
    )


def line_ids(bill: dict) -> list[int]:
    return [line["id"] for line in bill["lines"]]


def allow_all(bill: dict) -> list[dict]:
    return [{"id": line["id"], "allowedTaka": line["claimedTaka"]} for line in bill["lines"]]


# --- the schedule and what can be billed -------------------------------------------


def test_the_schedule_is_read_by_any_panel_lawyer(client):
    assert client.get("/lawyer/bills/schedule").status_code == 401
    r = client.get("/lawyer/bills/schedule", headers=LAWYER)
    assert r.status_code == 200
    schedule = r.json()
    assert schedule["version"] == "2026.1"
    assert len(schedule["heads"]) == 11
    assert schedule["reference"]["bn"].startswith("জেলা লিগ্যাল এইড কমিটি")


def test_a_closed_case_is_billable_and_an_open_one_is_not(client):
    create_moyuri(client)
    assign(client, "LAW-21")
    court_case = register_case(client)
    client.post(
        f"/dlao/cases/{REF}/records", json={"court_case_id": court_case["id"]}, headers=OFFICER
    )
    client.post(
        f"/lawyer/cases/{REF}/updates",
        json={"stage": "judgment", "summary": "Judgment given; maintenance decreed in full."},
        headers=LAWYER,
    )
    open_view = client.get("/lawyer/bills", headers=LAWYER).json()
    assert open_view == {"bills": [], "billable": [], "totals": {
        "claimed": 0, "allowed": 0, "released": 0, "awaitingCourt": 0,
    }}  # fmt: skip

    close_case(client)
    [billable] = client.get("/lawyer/bills", headers=LAWYER).json()["billable"]
    assert billable["ref"] == REF and billable["outcome"] == "resolved"
    assert billable["category"] == "domesticViolence"
    assert billable["client"] == {"name": "Moyuri Akter", "nameBn": "ময়ূরী আক্তার"}
    # The court that heard it, from the court record linked to the case.
    assert billable["court"] == {
        "id": "RNG-CJM",
        "name": "Chief Judicial Magistrate Court, Rangpur",
        "nameBn": "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
    }
    assert billable["hearings"] == 1 and billable["closedAt"] is not None
    # Another lawyer has nothing to claim for it.
    assert client.get("/lawyer/bills", headers=OTHER_LAWYER).json()["billable"] == []


def test_a_case_with_a_bill_is_no_longer_billable(client):
    closed_case_with_a_court(client)
    assert start(client).status_code == 201
    mine = client.get("/lawyer/bills", headers=LAWYER).json()
    assert mine["billable"] == []
    assert [b["number"] for b in mine["bills"]] == [NUMBER]


# --- starting a bill ----------------------------------------------------------------


def test_a_bill_can_only_be_started_by_the_lawyer_who_took_the_case(client):
    closed_case_with_a_court(client)
    r = start(client, headers=OTHER_LAWYER)
    assert r.status_code == 403
    assert r.json()["detail"] == "This case is not assigned to you"
    assert start(client, headers={"X-Lawyer-Id": "LAW-99"}).status_code == 401


def test_a_bill_waits_until_the_case_is_closed(client):
    create_moyuri(client)
    assign(client, "LAW-21")
    r = start(client, courtId="RNG-CJM")
    assert r.status_code == 409
    assert r.json()["detail"] == (
        "The case is application: a bill is claimed once the case is closed"
    )


def test_a_case_has_one_bill_and_the_court_must_be_known(client):
    closed_case_with_a_court(client, link_court=False)
    missing = start(client)
    assert missing.status_code == 422
    assert "which court heard it" in missing.json()["detail"]
    assert start(client, courtId="RNG-XYZ").status_code == 422

    r = start(client, courtId="rng-fam", note="Family Court, Rangpur Sadar heard the case.")
    assert r.status_code == 201, r.text
    bill = r.json()
    assert bill["number"] == NUMBER and bill["status"] == "draft"
    assert bill["court"]["id"] == "RNG-FAM"
    assert bill["lawyer"] == {
        "id": "LAW-21", "name": "Adv. Taslima Akter", "nameBn": "অ্যাড. তাসলিমা আক্তার",
        "enrolment": "BD-BAR-20185",
    }  # fmt: skip
    assert bill["case"]["ref"] == REF and bill["case"]["outcome"] == "resolved"
    assert bill["lines"] == [] and bill["claimedTotal"] == 0
    assert bill["allowedTotal"] is None and bill["scheduleVersion"] == "2026.1"
    assert bill["submittedAt"] is None and bill["voucherNumber"] is None

    again = start(client, courtId="RNG-FAM")
    assert again.status_code == 409
    assert again.json()["detail"] == f"This case already has bill {NUMBER}"


# --- itemising it ------------------------------------------------------------------


def test_saving_replaces_every_line_and_prices_them_against_the_schedule(client):
    closed_case_with_a_court(client)
    start(client)
    r = save(client, note="Four hearings between March and August.")
    assert r.status_code == 200, r.text
    bill = r.json()
    assert bill["claimedTotal"] == CLAIMED and bill["allowedTotal"] is None
    assert bill["note"] == "Four hearings between March and August."
    first = bill["lines"][0]
    assert first["head"] == "appearance" and first["claimedTaka"] == 900
    assert first["ceilingTaka"] == 1000 and first["overCeiling"] is False
    assert first["allowedTaka"] is None and first["disallowedReason"] is None
    assert first["incurredOn"] == day(-40)

    # Saving again replaces the lot rather than adding to it.
    once = save(client, lines=[LINES[0]]).json()
    assert len(once["lines"]) == 1 and once["claimedTotal"] == 900
    assert line_ids(once) != line_ids(bill)


def test_a_line_over_its_ceiling_is_refused_with_both_numbers(client):
    closed_case_with_a_court(client)
    start(client)
    over = [{**LINES[0], "claimedTaka": 1800}, {**LINES[2], "voucherRef": None}]
    r = save(client, lines=over)
    assert r.status_code == 422
    assert r.json()["detail"]["issues"] == [
        "Appearance at a hearing: 1800 taka is over the 1000 taka ceiling",
        "Court fee: give the receipt or voucher reference",
    ]
    # Nothing of the refused save is kept.
    assert client.get(f"/lawyer/bills/{NUMBER}", headers=LAWYER).json()["lines"] == []


def test_a_head_that_may_be_claimed_once_cannot_be_claimed_twice(client):
    closed_case_with_a_court(client)
    start(client)
    r = save(client, lines=[LINES[3], {**LINES[3], "voucherRef": "VK-2026-78"}])
    assert r.status_code == 422
    assert r.json()["detail"]["issues"] == [
        "Vakalatnama: may be claimed only once on a bill, and is claimed 2 times",
    ]


def test_a_bill_over_the_whole_case_ceiling_cannot_be_sent(client):
    closed_case_with_a_court(client)
    start(client)
    many = [{**LINES[0], "description": f"Hearing {i}", "claimedTaka": 1000} for i in range(16)]
    assert save(client, lines=many).status_code == 200
    r = submit(client)
    assert r.status_code == 422
    assert r.json()["detail"]["issues"] == [
        "The bill claims 16000 taka, over the 15000 taka ceiling for one case",
    ]


def test_an_empty_bill_cannot_be_sent(client):
    closed_case_with_a_court(client)
    start(client)
    r = submit(client)
    assert r.status_code == 422
    assert r.json()["detail"]["issues"] == [
        "The bill has no lines: itemise what the case cost before sending it",
    ]
    assert client.get(f"/lawyer/bills/{NUMBER}", headers=LAWYER).json()["status"] == "draft"


def test_a_submitted_bill_is_out_of_the_lawyers_hands(client):
    bill = submitted_bill(client)
    assert bill["status"] == "submitted" and bill["submittedAt"] is not None
    assert bill["claimedTotal"] == CLAIMED and bill["allowedTotal"] is None
    for r in (save(client), submit(client)):
        assert r.status_code == 409
        assert r.json()["detail"] == (
            "This bill is submitted; only a draft or a returned bill can be changed"
        )
    totals = client.get("/lawyer/bills", headers=LAWYER).json()["totals"]
    assert totals == {"claimed": CLAIMED, "allowed": 0, "released": 0, "awaitingCourt": CLAIMED}


def test_another_lawyers_bill_is_not_even_confirmed_to_exist(client):
    submitted_bill(client)
    for method, path in (
        ("get", f"/lawyer/bills/{NUMBER}"),
        ("put", f"/lawyer/bills/{NUMBER}"),
        ("post", f"/lawyer/bills/{NUMBER}/submit"),
    ):
        r = client.request(method, path, json={"lines": []}, headers=OTHER_LAWYER)
        assert r.status_code == 404, path
        assert r.json()["detail"] == f"No bill {NUMBER}"
    assert client.get("/lawyer/bills", headers=OTHER_LAWYER).json()["bills"] == []


# --- the court's decision ----------------------------------------------------------


def test_a_court_sees_only_the_bills_sent_to_it(client):
    submitted_bill(client)
    [waiting] = client.get("/court/bills", headers=CJM).json()["bills"]
    assert waiting["number"] == NUMBER and waiting["status"] == "submitted"
    assert waiting["lawyer"]["name"] == "Adv. Taslima Akter"
    assert waiting["case"]["client"]["name"] == "Moyuri Akter"

    other = client.get("/court/bills", headers=NST).json()
    assert other == {"bills": [], "totals": {
        "claimed": 0, "allowed": 0, "released": 0, "awaitingCourt": 0,
    }}  # fmt: skip
    for method, path, body in (
        ("get", f"/court/bills/{NUMBER}", None),
        ("post", f"/court/bills/{NUMBER}/verify", {"lines": [{"id": 1, "allowedTaka": 0}]}),
        ("post", f"/court/bills/{NUMBER}/return", {"justification": "x" * 25}),
        ("post", f"/court/bills/{NUMBER}/reject", {"justification": "x" * 25}),
        ("post", f"/court/bills/{NUMBER}/release", {"voucherNumber": "V-1"}),
    ):
        r = client.request(method, path, json=body, headers=NST)
        assert r.status_code == 404, path
        assert r.json()["detail"] == f"No bill {NUMBER}"


def test_a_draft_is_not_yet_the_courts_business(client):
    closed_case_with_a_court(client)
    start(client)
    save(client)
    assert client.get("/court/bills", headers=CJM).json()["bills"] == []
    assert client.get(f"/court/bills/{NUMBER}", headers=CJM).status_code == 404


def test_verify_refuses_a_cut_with_no_reason(client):
    bill = submitted_bill(client)
    ids = line_ids(bill)
    r = verify(client, [{"id": ids[0], "allowedTaka": 600}, *allow_all(bill)[1:]])
    assert r.status_code == 422
    assert r.json()["detail"]["issues"] == [
        f"Line {ids[0]}: say in at least 10 characters why the 900 taka claimed was cut to 600",
    ]
    # Too short is no better than none at all.
    short = [{"id": ids[0], "allowedTaka": 600, "disallowedReason": "too much"},
             *allow_all(bill)[1:]]  # fmt: skip
    assert verify(client, short).status_code == 422
    assert client.get(f"/court/bills/{NUMBER}", headers=CJM).json()["status"] == "submitted"


def test_verify_needs_every_line_once_and_within_what_was_claimed(client):
    bill = submitted_bill(client)
    ids = line_ids(bill)
    partial = verify(client, allow_all(bill)[:2])
    assert partial.status_code == 422
    assert partial.json()["detail"]["issues"] == [
        f"Line {ids[2]} (Court fee stamps on the plaint) has no decision",
        f"Line {ids[3]} (Vakalatnama stamp) has no decision",
    ]
    twice = verify(client, [*allow_all(bill), allow_all(bill)[0]])
    assert twice.json()["detail"]["issues"] == [
        f"Line {ids[0]} is decided 2 times; decide each line once",
    ]
    stranger = verify(client, [*allow_all(bill), {"id": 9999, "allowedTaka": 100}])
    assert stranger.json()["detail"]["issues"] == ["Line 9999 is not on this bill"]
    too_much = verify(client, [{"id": ids[0], "allowedTaka": 1000}, *allow_all(bill)[1:]])
    assert too_much.json()["detail"]["issues"] == [
        f"Line {ids[0]}: allow between 0 and the 900 taka claimed, not 1000",
    ]
    below_zero = verify(client, [{"id": ids[0], "allowedTaka": -1}, *allow_all(bill)[1:]])
    assert below_zero.json()["detail"]["issues"] == [
        f"Line {ids[0]}: allow between 0 and the 900 taka claimed, not -1",
    ]


def test_a_partial_cut_is_allowed_and_the_totals_add_up(client, db):
    bill = submitted_bill(client)
    ids = line_ids(bill)
    cut = "Only two hearings appear on the order sheet, not three."
    r = verify(
        client,
        [
            {"id": ids[0], "allowedTaka": 600, "disallowedReason": cut},
            {"id": ids[1], "allowedTaka": 1400},
            {"id": ids[2], "allowedTaka": 1200},
            {"id": ids[3], "allowedTaka": 0, "disallowedReason": "No stamp receipt was attached."},
        ],
        note="Allowed as above against the 2026.1 schedule.",
    )
    assert r.status_code == 200, r.text
    decided = r.json()
    assert decided["status"] == "verified"
    assert decided["claimedTotal"] == CLAIMED == 3800
    assert decided["allowedTotal"] == 600 + 1400 + 1200 + 0 == 3200
    assert decided["decidedAt"] is not None
    assert decided["decisionNote"] == "Allowed as above against the 2026.1 schedule."
    first, _, paid, refused = decided["lines"]
    assert first["allowedTaka"] == 600 and first["disallowedReason"] == cut
    # A line allowed in full carries no reason.
    assert paid["allowedTaka"] == 1200 and paid["disallowedReason"] is None
    assert refused["allowedTaka"] == 0

    # The lawyer sees the same decision, and the office's ledger has the two totals.
    mine = client.get(f"/lawyer/bills/{NUMBER}", headers=LAWYER).json()
    assert mine["allowedTotal"] == 3200 and mine["lines"][0]["disallowedReason"] == cut
    [entry] = [a for a in _ledger(db) if a.action == "bill.verified"]
    assert entry.actor == "court:CS-11"
    assert entry.details == {"bill": NUMBER, "claimedTaka": 3800, "allowedTaka": 3200}
    assert verify(client, allow_all(bill)).status_code == 409


def test_a_bill_is_released_only_after_it_is_verified(client):
    bill = submitted_bill(client)
    early = client.post(
        f"/court/bills/{NUMBER}/release", json={"voucherNumber": "V-114"}, headers=CJM
    )
    assert early.status_code == 409
    assert early.json()["detail"] == (
        "This bill is submitted: verify each line before releasing the money"
    )
    assert verify(client, allow_all(bill)).status_code == 200

    r = client.post(
        f"/court/bills/{NUMBER}/release", json={"voucherNumber": "V-2026-114"}, headers=CJM
    )
    assert r.status_code == 200, r.text
    released = r.json()
    assert released["status"] == "released"
    assert released["voucherNumber"] == "V-2026-114" and released["releasedAt"] is not None
    assert released["allowedTotal"] == CLAIMED
    assert client.post(
        f"/court/bills/{NUMBER}/release", json={"voucherNumber": "V-2026-115"}, headers=CJM
    ).status_code == 409  # fmt: skip
    # An empty voucher number is no voucher number.
    assert released["voucherNumber"] == "V-2026-114"

    totals = client.get("/lawyer/bills", headers=LAWYER).json()["totals"]
    assert totals == {
        "claimed": CLAIMED, "allowed": CLAIMED, "released": CLAIMED, "awaitingCourt": 0,
    }  # fmt: skip


def test_a_returned_bill_is_corrected_and_sent_again(client):
    bill = submitted_bill(client)
    reason = "The court fee voucher number does not match the challan on the record."
    r = client.post(f"/court/bills/{NUMBER}/return", json={"justification": reason}, headers=CJM)
    assert r.status_code == 200, r.text
    returned = r.json()
    assert returned["status"] == "returned" and returned["decisionNote"] == reason
    # Nothing is decided on a bill going back.
    assert returned["allowedTotal"] is None
    assert [line["allowedTaka"] for line in returned["lines"]] == [None] * 4
    assert client.post(
        f"/court/bills/{NUMBER}/return", json={"justification": reason}, headers=CJM
    ).status_code == 409  # fmt: skip
    assert client.post(
        f"/court/bills/{NUMBER}/verify", json={"lines": allow_all(bill)}, headers=CJM
    ).status_code == 409  # fmt: skip

    fixed = [*LINES[:2], {**LINES[2], "voucherRef": "CF-2026-118"}, LINES[3]]
    corrected = save(client, lines=fixed)
    assert corrected.status_code == 200, corrected.text
    # Editing it starts the bill again: the court's reason no longer describes it.
    assert corrected.json()["status"] == "draft" and corrected.json()["decisionNote"] is None
    assert submit(client).status_code == 200
    again = client.get(f"/court/bills/{NUMBER}", headers=CJM).json()
    assert again["status"] == "submitted"
    assert again["lines"][2]["voucherRef"] == "CF-2026-118"
    # A returned bill can also be submitted again unchanged.
    client.post(f"/court/bills/{NUMBER}/return", json={"justification": reason}, headers=CJM)
    assert submit(client).status_code == 200


def test_a_rejected_bill_is_paid_nothing(client):
    submitted_bill(client)
    reason = "The case was withdrawn before any hearing; no appearance was made."
    r = client.post(f"/court/bills/{NUMBER}/reject", json={"justification": reason}, headers=CJM)
    assert r.status_code == 200, r.text
    rejected = r.json()
    assert rejected["status"] == "rejected" and rejected["decisionNote"] == reason
    assert rejected["allowedTotal"] == 0 and rejected["decidedAt"] is not None
    assert client.post(
        f"/court/bills/{NUMBER}/release", json={"voucherNumber": "V-1"}, headers=CJM
    ).status_code == 409  # fmt: skip
    # A rejection needs a reason like every other override.
    assert save(client).status_code == 409
    totals = client.get("/lawyer/bills", headers=LAWYER).json()["totals"]
    assert totals == {"claimed": CLAIMED, "allowed": 0, "released": 0, "awaitingCourt": 0}


def test_returning_and_rejecting_need_a_real_reason(client):
    submitted_bill(client)
    for action in ("return", "reject"):
        for body in ({"justification": "Wrong."}, {}):
            r = client.post(f"/court/bills/{NUMBER}/{action}", json=body, headers=CJM)
            assert r.status_code == 422, action


# --- the ledger ---------------------------------------------------------------------


def _ledger(db):  # type: ignore[no-untyped-def]
    from sqlalchemy import select

    from app.models import AuditEntry

    return list(db.scalars(select(AuditEntry).order_by(AuditEntry.seq)))


def test_every_step_of_a_bill_is_on_the_unbroken_ledger(client, db):
    bill = submitted_bill(client)
    reason = "The appearance count does not match the order sheet on the record."
    client.post(f"/court/bills/{NUMBER}/return", json={"justification": reason}, headers=CJM)
    save(client)
    submit(client)
    bill = client.get(f"/lawyer/bills/{NUMBER}", headers=LAWYER).json()
    verify(client, allow_all(bill), note="Allowed in full.")
    client.post(f"/court/bills/{NUMBER}/release", json={"voucherNumber": "V-2026-114"}, headers=CJM)

    bills = [e for e in _ledger(db) if e.entity_type == "bill"]
    assert [e.action for e in bills] == [
        "bill.drafted", "bill.submitted", "bill.returned", "bill.submitted",
        "bill.verified", "bill.released",
    ]  # fmt: skip
    assert [e.actor for e in bills] == [
        "LAW-21", "LAW-21", "court:CS-11", "LAW-21", "court:CS-11", "court:CS-11",
    ]  # fmt: skip
    assert bills[2].justification == reason
    assert bills[0].details["case"] == REF and bills[0].details["court"] == "RNG-CJM"
    assert bills[-1].details == {
        "bill": NUMBER, "voucherNumber": "V-2026-114", "allowedTaka": CLAIMED,
    }  # fmt: skip
    # A bill is not the DLAO case's own activity, and the chain is whole.
    actions = {a["action"] for a in client.get(f"/dlao/cases/{REF}").json()["activity"]}
    assert not any(a.startswith("bill.") for a in actions)
    assert client.get("/dlao/audit/verify").json() == {"ok": True, "brokenAtSeq": None}


def test_a_case_closed_without_a_category_still_reads_as_one(client, db):
    """``Case.category`` is nullable, and the court dashboard has no mapping layer.

    A case closed before triage ever named a category would otherwise show the
    court a blank label, so the views fall back to "other" — a category both
    dashboards already know.
    """
    closed_case_with_a_court(client)
    case = db.scalars(select(Case).where(Case.application_id == REF)).first()
    assert case is not None
    case.category = None
    db.commit()

    billable = client.get("/lawyer/bills", headers=LAWYER).json()["billable"]
    assert [c["category"] for c in billable] == ["other"]

    bill = start(client).json()
    assert bill["case"]["category"] == "other"
