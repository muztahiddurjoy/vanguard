import wave
from array import array

import pytest

from app.services.audio import ulaw_decode
from scripts.simulate_call import read_turn, write_stereo


def write_wav(path, samples, rate=8000, channels=1):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(array("h", samples).tobytes())


def test_read_turn_encodes_8khz_mono_as_ulaw(tmp_path):
    path = tmp_path / "turn.wav"
    write_wav(path, [0, 1000, -1000, 8000])
    ulaw = read_turn(path)
    assert len(ulaw) == 4
    decoded = list(ulaw_decode(ulaw))
    assert decoded[0] == 0
    assert decoded[1] == pytest.approx(1000, rel=0.05)
    assert decoded[2] == pytest.approx(-1000, rel=0.05)


def test_read_turn_explains_how_to_convert_other_formats(tmp_path):
    path = tmp_path / "phone.wav"
    write_wav(path, [0] * 10, rate=44100)
    with pytest.raises(SystemExit, match=r"ffmpeg -i .*phone\.wav -ar 8000 -ac 1"):
        read_turn(path)


def test_write_stereo_pads_the_shorter_side(tmp_path):
    path = tmp_path / "call.wav"
    write_stereo(path, array("h", [1, 2, 3]), array("h", [9]))
    with wave.open(str(path), "rb") as w:
        assert (w.getnchannels(), w.getframerate(), w.getnframes()) == (2, 8000, 3)
        frames = array("h", w.readframes(3))
    assert list(frames) == [1, 9, 2, 0, 3, 0]
