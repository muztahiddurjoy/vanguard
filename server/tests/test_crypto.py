import base64

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from app.services import crypto


def _keypair() -> tuple[Ed25519PrivateKey, str]:
    private = Ed25519PrivateKey.generate()
    raw = private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return private, base64.b64encode(raw).decode()


def test_canonical_json_is_order_independent():
    assert crypto.canonical_json({"b": 1, "a": "গ"}) == crypto.canonical_json({"a": "গ", "b": 1})
    assert crypto.hash_payload({"b": 1, "a": 2}) == crypto.hash_payload({"a": 2, "b": 1})


def test_sha256_hex_known_value():
    assert crypto.sha256_hex("abc") == (
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )


def test_valid_signature_verifies():
    private, pub = _keypair()
    message = crypto.signing_message(7, crypto.sha256_hex("settlement text"))
    sig = base64.b64encode(private.sign(message)).decode()
    assert crypto.verify_ed25519(pub, sig, message)


def test_url_safe_unpadded_encoding_is_accepted():
    private, pub = _keypair()
    message = b"hello"
    sig = base64.urlsafe_b64encode(private.sign(message)).decode().rstrip("=")
    assert crypto.verify_ed25519(pub.rstrip("="), sig, message)


def test_tampered_message_or_wrong_key_fails():
    private, pub = _keypair()
    _, other_pub = _keypair()
    message = crypto.signing_message(7, crypto.sha256_hex("original"))
    sig = base64.b64encode(private.sign(message)).decode()
    assert not crypto.verify_ed25519(pub, sig, crypto.signing_message(7, "0" * 64))
    assert not crypto.verify_ed25519(pub, sig, crypto.signing_message(8, "0" * 64))
    assert not crypto.verify_ed25519(other_pub, sig, message)


def test_garbage_inputs_return_false_instead_of_raising():
    _, pub = _keypair()
    assert not crypto.verify_ed25519("not-a-key", "AAAA", b"x")
    assert not crypto.verify_ed25519(pub, "%%%", b"x")
    assert not crypto.verify_ed25519(pub, base64.b64encode(b"short").decode(), b"x")
