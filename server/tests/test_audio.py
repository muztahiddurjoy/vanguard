import itertools
import math
import struct
import warnings

import pytest

from app.services.audio import (
    FRAME_SAMPLES,
    ULAW_TO_LINEAR,
    TempoChanger,
    Upsampler,
    VoiceActivityDetector,
    pcm16_bytes,
    rms,
    ulaw_decode,
    ulaw_encode,
)

with warnings.catch_warnings():
    warnings.simplefilter("ignore", DeprecationWarning)
    try:
        import audioop  # removed in Python 3.13; the reference where it exists
    except ImportError:
        audioop = None

needs_audioop = pytest.mark.skipif(audioop is None, reason="audioop is not in this Python")


@needs_audioop
def test_ulaw_codec_matches_the_g711_reference():
    assert audioop is not None
    reference = struct.unpack("<256h", audioop.ulaw2lin(bytes(range(256)), 2))
    assert reference == ULAW_TO_LINEAR
    samples = list(range(-32768, 32768))
    packed = struct.pack(f"<{len(samples)}h", *samples)
    assert ulaw_encode(samples) == audioop.lin2ulaw(packed, 2)


def test_ulaw_round_trip():
    codes = bytes(range(256))
    assert ulaw_encode(ulaw_decode(codes)) == bytes(0xFF if c == 0x7F else c for c in codes)
    assert list(ulaw_decode(b"\xff\x7f")) == [0, 0]  # μ-law's two zeros


def test_pcm16_bytes_are_little_endian():
    assert pcm16_bytes(ulaw_decode(b"\x00")) == struct.pack("<h", ULAW_TO_LINEAR[0])


def test_upsampler_triples_the_rate_and_joins_chunks():
    up = Upsampler()
    first = up.process([300, 600])
    assert list(first) == [100, 200, 300, 400, 500, 600]
    # The next chunk interpolates from where the last one ended.
    assert list(up.process([900])) == [700, 800, 900]
    assert list(up.process([])) == []


def tone(amplitude: float, frames: int = 1, hz: float = 440.0) -> list[list[int]]:
    out = []
    for f in range(frames):
        start = f * FRAME_SAMPLES
        out.append(
            [
                round(amplitude * math.sin(2 * math.pi * hz * (start + i) / 8000))
                for i in range(FRAME_SAMPLES)
            ]
        )
    return out


def run(vad: VoiceActivityDetector, frames: list[list[int]]) -> list[str]:
    return [vad.frame(f) for f in frames]


def test_rms_of_a_sine():
    assert rms([]) == 0.0
    assert rms(tone(1000)[0]) == pytest.approx(1000 / math.sqrt(2), rel=0.02)


def test_turn_starts_after_200ms_of_speech_and_ends_after_the_pause():
    vad = VoiceActivityDetector(start_ms=200, end_ms=700)
    decisions = run(vad, tone(20, 25) + tone(4000, 50) + tone(20, 40))
    assert decisions[:25] == ["silence"] * 25
    # 10 loud frames confirm the turn; they are pre-roll, so the 10th says "start".
    assert decisions[25:35] == ["silence"] * 9 + ["start"]
    assert set(decisions[35:75]) == {"speech"}
    # 35 quiet frames (700 ms) end it.
    assert decisions[75:110] == ["speech"] * 34 + ["end"]
    assert decisions[110:] == ["silence"] * 5
    assert not vad.in_turn


def test_short_pauses_inside_a_turn_do_not_end_it():
    vad = VoiceActivityDetector(end_ms=700)
    decisions = run(vad, tone(20, 5) + tone(4000, 10) + (tone(20, 20) + tone(4000, 10)) * 3)
    assert decisions[14] == "start"
    assert "end" not in decisions


def test_learns_the_floor_from_the_first_frame():
    # Calls open with silence while the greeting plays; a loud first frame is
    # taken as the floor until a quieter one arrives.
    vad = VoiceActivityDetector()
    assert set(run(vad, tone(4000, 20))) == {"silence"}
    assert "start" in run(vad, tone(20, 1) + tone(4000, 10))


def test_a_click_does_not_start_a_turn():
    vad = VoiceActivityDetector()
    assert set(run(vad, tone(20, 10) + tone(6000, 3) + tone(20, 30))) == {"silence"}


def test_steady_line_noise_is_learned_and_speech_above_it_still_counts():
    vad = VoiceActivityDetector(min_speech_rms=500)
    # A noisy line (RMS ~850, above the absolute minimum) from the first frame.
    assert set(run(vad, tone(1200, 100, hz=150))) == {"silence"}
    assert vad.threshold > 2000
    assert "start" in run(vad, tone(9000, 15))


def test_quiet_audio_below_the_minimum_is_never_speech():
    vad = VoiceActivityDetector(min_speech_rms=500)
    assert set(run(vad, tone(10, 5) + tone(500, 50))) == {"silence"}  # RMS ~350


def test_a_turn_is_cut_at_the_maximum_length():
    vad = VoiceActivityDetector(start_ms=200, max_turn_ms=1000)
    decisions = run(vad, tone(20, 5) + tone(4000, 70))
    assert decisions[14] == "start"
    assert decisions[64] == "end"
    assert decisions[74] == "start"  # still talking: the next turn begins


# --- tempo -------------------------------------------------------------------------


def sine(hz: float, seconds: float, amplitude: int = 8000) -> list[int]:
    return [
        round(amplitude * math.sin(2 * math.pi * hz * n / 8000)) for n in range(int(seconds * 8000))
    ]


def pitch(samples) -> float:
    crossings = sum(1 for a, b in itertools.pairwise(samples) if (a < 0) != (b < 0))
    return crossings / 2 / (len(samples) / 8000)


def stretch(rate: float, samples: list[int], chunk: int) -> list[int]:
    changer = TempoChanger(rate)
    out: list[int] = []
    for i in range(0, len(samples), chunk):
        out.extend(changer.process(samples[i : i + chunk]))
    return out + list(changer.flush())


def test_tempo_speeds_speech_up_without_raising_its_pitch():
    voice = sine(180, 3.0)
    faster = stretch(1.25, voice, chunk=1000)
    assert len(faster) == pytest.approx(len(voice) / 1.25, abs=TempoChanger.WINDOW)
    assert pitch(faster) == pytest.approx(180, rel=0.01)
    assert faster[: TempoChanger.HOP] == voice[: TempoChanger.HOP]  # the start is kept whole
    slower = stretch(0.8, voice, chunk=1000)
    assert len(slower) == pytest.approx(len(voice) / 0.8, abs=TempoChanger.WINDOW)
    assert pitch(slower) == pytest.approx(180, rel=0.01)


def test_tempo_output_does_not_depend_on_how_the_input_is_chunked():
    voice = [a + b for a, b in zip(sine(150, 1.0), sine(410, 1.0, 3000), strict=True)]
    assert stretch(1.2, voice, chunk=37) == stretch(1.2, voice, chunk=len(voice))


def test_tempo_at_normal_speed_changes_nothing_and_short_input_comes_back_whole():
    voice = sine(200, 0.5)
    assert stretch(1.0, voice, chunk=160) == voice
    changer = TempoChanger(1.3)
    assert list(changer.process(voice[:100])) == []
    assert list(changer.flush()) == voice[:100]
    # Flushed, the changer starts over: a new stream keeps its start whole too.
    assert list(changer.process(voice))[: TempoChanger.HOP] == voice[: TempoChanger.HOP]
    with pytest.raises(ValueError):
        TempoChanger(3.0)
