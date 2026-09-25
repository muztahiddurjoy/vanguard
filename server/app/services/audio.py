"""Telephone audio helpers: G.711 μ-law, resampling and voice activity detection.

Twilio streams the caller as μ-law at 8 kHz in 20 ms frames. Speech-to-text
wants 16-bit PCM at 24 kHz and, for ``gpt-live-transcribe``, the caller's
turns marked by the client, since that model has no voice detection of its
own. Pure Python on purpose: a call is 50 small frames a second.
"""

import sys
from array import array
from collections import deque
from collections.abc import Iterable, Sequence
from typing import Literal

SAMPLE_RATE = 8000
FRAME_SAMPLES = 160  # 20 ms at 8 kHz, Twilio's frame size
FRAME_MS = 20

_BIAS = 0x84
_CLIP = 8159  # in 14-bit units


def _ulaw_to_linear(byte: int) -> int:
    u = ~byte & 0xFF
    magnitude = ((((u & 0x0F) << 3) + _BIAS) << ((u >> 4) & 0x07)) - _BIAS
    return -magnitude if u & 0x80 else magnitude


ULAW_TO_LINEAR: tuple[int, ...] = tuple(_ulaw_to_linear(b) for b in range(256))


def ulaw_decode(data: bytes) -> array:
    """μ-law bytes as 16-bit linear samples."""
    return array("h", (ULAW_TO_LINEAR[b] for b in data))


_SEGMENT_ENDS = (0x3F, 0x7F, 0xFF, 0x1FF, 0x3FF, 0x7FF, 0xFFF, 0x1FFF)


def linear_to_ulaw(sample: int) -> int:
    """G.711's reference encoder, on the sample's top 14 bits."""
    value = sample >> 2
    mask = 0xFF
    if value < 0:
        value, mask = -value, 0x7F
    value = min(value, _CLIP) + (_BIAS >> 2)
    for segment, end in enumerate(_SEGMENT_ENDS):
        if value <= end:
            return ((segment << 4) | ((value >> (segment + 1)) & 0x0F)) ^ mask
    return 0x7F ^ mask


def ulaw_encode(samples: Iterable[int]) -> bytes:
    """16-bit linear samples as μ-law bytes."""
    return bytes(linear_to_ulaw(s) for s in samples)


def pcm16_bytes(samples: array) -> bytes:
    """Samples as little-endian 16-bit PCM, whatever this machine's byte order."""
    if sys.byteorder == "big":
        samples = array("h", samples)
        samples.byteswap()
    return samples.tobytes()


class Upsampler:
    """8 kHz to 24 kHz by linear interpolation, continuous across chunks.

    Telephone speech carries nothing above 4 kHz, so interpolation loses
    nothing the transcriber could use.
    """

    FACTOR = 3

    def __init__(self) -> None:
        self._last = 0

    def process(self, samples: Sequence[int]) -> array:
        out = array("h")
        prev = self._last
        for s in samples:
            step = s - prev
            out.append(prev + round(step / 3))
            out.append(prev + round(2 * step / 3))
            out.append(s)
            prev = s
        self._last = prev
        return out


def rms(samples: Sequence[int]) -> float:
    if not samples:
        return 0.0
    return float((sum(s * s for s in samples) / len(samples)) ** 0.5)


VadDecision = Literal["silence", "start", "speech", "end"]


class VoiceActivityDetector:
    """Marks the caller's turns in 20 ms frames by loudness against the line's noise.

    ``frame()`` returns, for each frame:

    - ``"silence"``: no turn in progress (keep the frame as pre-roll);
    - ``"start"``: a turn has begun (the frames that triggered it are in the pre-roll);
    - ``"speech"``: inside a turn;
    - ``"end"``: the turn ended with this frame, after ``end_ms`` of quiet, or
      because it reached ``max_turn_ms``.

    A turn starts once ``start_ms`` of loud frames fall within a window half as
    long again, so a cough or a click does not interrupt a reply. "Loud" is
    three times the line's noise floor, and never below ``min_speech_rms``. The
    floor is learned between turns: it falls at once to a quieter frame and rises
    slowly, so steady line noise stops counting as speech.
    """

    NOISE_FACTOR = 3.0
    FLOOR_RISE = 0.02

    def __init__(
        self,
        *,
        min_speech_rms: float = 500,
        start_ms: int = 200,
        end_ms: int = 700,
        max_turn_ms: int = 60_000,
    ):
        self.min_speech_rms = min_speech_rms
        self.start_frames = max(1, start_ms // FRAME_MS)
        self.end_frames = max(1, end_ms // FRAME_MS)
        self.max_turn_frames = max(1, max_turn_ms // FRAME_MS)
        self._window: deque[bool] = deque(maxlen=self.start_frames * 3 // 2)
        self._floor: float | None = None
        self.in_turn = False
        self._quiet = 0
        self._turn_frames = 0

    @property
    def threshold(self) -> float:
        floor = self._floor or 0.0
        return max(self.min_speech_rms, floor * self.NOISE_FACTOR)

    def frame(self, samples: Sequence[int]) -> VadDecision:
        level = rms(samples)
        loud = level >= self.threshold
        if not self.in_turn:
            self._learn_noise(level)
            self._window.append(loud)
            if sum(self._window) >= self.start_frames:
                self.in_turn = True
                self._quiet = 0
                self._turn_frames = 0
                self._window.clear()
                return "start"
            return "silence"

        self._turn_frames += 1
        self._quiet = 0 if loud else self._quiet + 1
        if self._quiet >= self.end_frames or self._turn_frames >= self.max_turn_frames:
            self.in_turn = False
            return "end"
        return "speech"

    def _learn_noise(self, level: float) -> None:
        if self._floor is None or level < self._floor:
            self._floor = level
        else:
            self._floor += (level - self._floor) * self.FLOOR_RISE
