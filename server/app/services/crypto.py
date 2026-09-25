"""Hashing and T11 Ed25519 signature verification.

Signing protocol (T11): the client computes the SHA-256 of the document's
content, then signs the UTF-8 bytes of ``signing_message(document_id, digest)``
with the signer's Ed25519 private key. The server recomputes the digest from its
own copy of the document, so a signature over stale or altered text never verifies.
"""

import base64
import binascii
import hashlib
import json
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

SIGNING_DOMAIN = "dlas-t11-v1"


def canonical_json(obj: Any) -> bytes:
    """Deterministic JSON: sorted keys, no whitespace, UTF-8."""
    return json.dumps(
        obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str
    ).encode("utf-8")


def sha256_hex(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def hash_payload(obj: Any) -> str:
    return sha256_hex(canonical_json(obj))


def signing_message(document_id: int, content_sha256: str) -> bytes:
    return f"{SIGNING_DOMAIN}|{document_id}|{content_sha256}".encode()


def _b64decode(value: str) -> bytes:
    value = value.strip()
    padded = value + "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode(padded.replace("+", "-").replace("/", "_"))
    except (binascii.Error, ValueError) as exc:
        raise ValueError("not valid base64") from exc


def load_public_key(public_key_b64: str) -> Ed25519PublicKey:
    """Parse a raw 32-byte Ed25519 public key encoded as base64 (standard or URL-safe)."""
    raw = _b64decode(public_key_b64)
    if len(raw) != 32:
        raise ValueError("Ed25519 public keys are 32 bytes")
    return Ed25519PublicKey.from_public_bytes(raw)


def verify_ed25519(public_key_b64: str, signature_b64: str, message: bytes) -> bool:
    """True only for a well-formed key and a valid signature; never raises."""
    try:
        key = load_public_key(public_key_b64)
        signature = _b64decode(signature_b64)
        if len(signature) != 64:
            return False
        key.verify(signature, message)
    except (ValueError, InvalidSignature):
        return False
    return True


def public_key_fingerprint(public_key_b64: str) -> str:
    """Short stable identifier for a signer's key, for display and audit."""
    return sha256_hex(_b64decode(public_key_b64))[:16]
