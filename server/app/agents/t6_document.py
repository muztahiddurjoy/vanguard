"""T6 documents: read (OCR), summarize, then list what is still missing.

Plain-text uploads are read directly. Scans and PDFs are transcribed by Claude
when it is configured; otherwise they are marked for manual review rather than
guessed at. The checklist is rule-based per case category, so the "missing
items" list an applicant is told about is predictable and reviewable.
"""

import base64
import re
from typing import Any, Literal, cast

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from pydantic import BaseModel, Field

from app.agents.llm import StructuredLLM, default_llm
from app.agents.state import DocumentState
from app.models.document import DocumentKind

# (key, English label, Bangla label, required)
ChecklistSpec = tuple[str, str, str, bool]

COMMON: list[ChecklistSpec] = [
    ("nid_copy", "National ID card (or birth certificate)", "জাতীয় পরিচয়পত্র (বা জন্ম নিবন্ধন)", True),
    ("income_proof", "Proof of income or poverty certificate", "আয়ের প্রমাণ বা দারিদ্র্য সনদ", False),
]  # fmt: skip

BY_CATEGORY: dict[str, list[ChecklistSpec]] = {
    "domesticViolence": [
        ("medical_certificate", "Medical certificate of injuries", "আঘাতের মেডিকেল সনদ", True),
        ("gd_fir_copy", "Copy of GD or FIR, if filed", "জিডি বা এজাহারের কপি (যদি থাকে)", False),
        ("marriage_certificate", "Marriage certificate (kabinnama)", "কাবিননামা", False),
        ("photo_evidence", "Photos of injuries or damage", "আঘাত বা ক্ষতির ছবি", False),
    ],
    "dowryHarassment": [
        ("marriage_certificate", "Marriage certificate (kabinnama)", "কাবিননামা", True),
        ("medical_certificate", "Medical certificate, if injured", "মেডিকেল সনদ (আঘাত থাকলে)", False),
        ("gd_fir_copy", "Copy of GD or FIR, if filed", "জিডি বা এজাহারের কপি (যদি থাকে)", False),
    ],
    "cyberHarassment": [
        ("screenshot", "Screenshots with dates and profile links", "তারিখ ও প্রোফাইল লিংকসহ স্ক্রিনশট", True),
        ("gd_fir_copy", "Copy of GD, if filed", "জিডির কপি (যদি থাকে)", False),
    ],
    "landDispute": [
        ("land_record", "Deed, khatian or porcha", "দলিল, খতিয়ান বা পর্চা", True),
    ],
    "familyMaintenance": [
        ("marriage_certificate", "Marriage certificate (kabinnama)", "কাবিননামা", True),
        ("birth_certificate", "Children's birth certificates", "সন্তানদের জন্ম নিবন্ধন", False),
    ],
    "labourDispute": [
        ("employment_proof", "Appointment letter, ID card or pay slip", "নিয়োগপত্র, আইডি কার্ড বা বেতন স্লিপ", True),
    ],
    "childCustody": [
        ("birth_certificate", "Child's birth certificate", "সন্তানের জন্ম নিবন্ধন", True),
        ("marriage_certificate", "Marriage or divorce papers", "বিবাহ বা তালাকের কাগজ", False),
    ],
}  # fmt: skip

KIND_TERMS: dict[str, tuple[str, ...]] = {
    "nid_copy": ("national id", "nid", "জাতীয় পরিচয়"),
    "medical_certificate": ("medical", "hospital", "injury report", "চিকিৎসা", "হাসপাতাল", "মেডিকেল"),
    "gd_fir_copy": ("general diary", "first information report", "fir", "g.d.", "থানা", "এজাহার", "জিডি"),
    "marriage_certificate": ("kabin", "nikah", "marriage", "কাবিন", "নিকাহ", "বিবাহ"),
    "birth_certificate": ("birth registration", "birth certificate", "জন্ম নিবন্ধন"),
    "land_record": ("khatian", "porcha", "deed", "mouza", "খতিয়ান", "পর্চা", "দলিল", "মৌজা"),
    "employment_proof": ("appointment letter", "pay slip", "payslip", "employee id", "নিয়োগপত্র", "বেতন"),
    "income_proof": ("income certificate", "poverty", "আয়ের সনদ", "দারিদ্র্য"),
    "screenshot": ("screenshot", "facebook", "messenger", "ফেসবুক"),
}  # fmt: skip

# If an applicant has no NID, a birth certificate satisfies the ID item.
SATISFIED_BY = {"nid_copy": {"nid_copy", "birth_certificate"}}


def classify_kind(text: str, filename: str | None = None) -> str:
    haystack = f"{filename or ''} {text}".casefold()
    best, best_hits = DocumentKind.OTHER.value, 0
    for kind, terms in KIND_TERMS.items():
        hits = sum(1 for t in terms if t in haystack)
        if hits > best_hits:
            best, best_hits = kind, hits
    return best


def extractive_summary(text: str, limit: int = 280) -> str:
    """First sentences up to ``limit`` characters (Bangla danda or Latin stops)."""
    sentences = re.split(r"(?<=[.!?।])\s+", re.sub(r"\s+", " ", text).strip())
    out = ""
    for sentence in sentences:
        if out and len(out) + len(sentence) + 1 > limit:
            break
        out = f"{out} {sentence}".strip()
    return out[:limit]


class LLMReading(BaseModel):
    text: str = Field(description="Full transcription, original language and script")
    kind: Literal[
        "nid_copy", "medical_certificate", "gd_fir_copy", "marriage_certificate",
        "birth_certificate", "land_record", "employment_proof", "screenshot",
        "photo_evidence", "income_proof", "other",
    ]  # fmt: skip
    summary: str = Field(description="Two plain sentences for a legal aid officer, in English")
    legible: bool


READ_SYSTEM = (
    "You read documents submitted with legal aid applications in Bangladesh: ID cards, "
    "medical certificates, police GD/FIR copies, kabinnamas, land records (khatian, porcha, "
    "deeds), pay slips and screenshots. Transcribe the text exactly in its original script, "
    "identify the document type, and summarize what it shows. If it is not legible, say so "
    "with legible=false rather than guessing."
)

MEDIA_BLOCK = {"application/pdf": "document"}


def _decode_text(doc: dict[str, Any]) -> str | None:
    if doc.get("text"):
        return str(doc["text"])
    ctype = doc.get("content_type") or ""
    if ctype.startswith("text/") and doc.get("data_b64"):
        return base64.b64decode(doc["data_b64"]).decode("utf-8", errors="replace")
    return None


def build_document_graph(llm: StructuredLLM | None = None) -> CompiledStateGraph:
    def read(state: DocumentState) -> DocumentState:
        results: dict[str, dict[str, Any]] = {}
        for doc in state.get("documents", []):
            key = str(doc["id"])
            text = _decode_text(doc)
            if text is not None:
                results[key] = {
                    "text": text,
                    "kind": doc.get("kind") or classify_kind(text, doc.get("filename")),
                    "summary": extractive_summary(text),
                    "status": "processed",
                }
                continue

            ctype = doc.get("content_type") or ""
            readable = ctype.startswith("image/") or ctype == "application/pdf"
            reading = None
            if llm is not None and readable and doc.get("data_b64"):
                source = {"type": "base64", "media_type": ctype, "data": doc["data_b64"]}
                reading = llm.structured(
                    system=READ_SYSTEM,
                    content=[
                        {"type": MEDIA_BLOCK.get(ctype, "image"), "source": source},
                        {"type": "text", "text": "Read this document."},
                    ],
                    schema=LLMReading,
                    max_tokens=8000,
                )
            if reading is not None and reading.legible:
                results[key] = {
                    "text": reading.text,
                    "kind": doc.get("kind") or reading.kind,
                    "summary": reading.summary,
                    "status": "processed",
                }
            else:
                results[key] = {
                    "text": None,
                    "kind": doc.get("kind") or classify_kind("", doc.get("filename")),
                    "summary": None,
                    "status": "needs_review",
                }
        return {"results": results}

    def checklist(state: DocumentState) -> DocumentState:
        results = state.get("results", {})
        have: dict[str, str] = {}
        for doc_id, r in results.items():
            have.setdefault(r["kind"], doc_id)

        specs = COMMON + BY_CATEGORY.get(state.get("category") or "", [])
        items: list[dict[str, Any]] = []
        for key, label, label_bn, required in specs:
            match = next((have[k] for k in SATISFIED_BY.get(key, {key}) if k in have), None)
            items.append(
                {
                    "key": key,
                    "label": label,
                    "label_bn": label_bn,
                    "required": required,
                    "status": "provided" if match else "missing",
                    "document_id": int(match) if match else None,
                }
            )
        missing = [i["key"] for i in items if i["required"] and i["status"] == "missing"]
        return {"checklist": items, "missing": missing}

    graph = StateGraph(DocumentState)
    graph.add_node("read", read)
    graph.add_node("checklist", checklist)
    graph.add_edge(START, "read")
    graph.add_edge("read", "checklist")
    graph.add_edge("checklist", END)
    return graph.compile()


def run_document_review(
    category: str | None,
    documents: list[dict[str, Any]],
    *,
    llm: StructuredLLM | None = None,
    use_default_llm: bool = True,
) -> DocumentState:
    model = llm if llm is not None else (default_llm() if use_default_llm else None)
    out = build_document_graph(model).invoke({"category": category, "documents": documents})
    return cast(DocumentState, out)
