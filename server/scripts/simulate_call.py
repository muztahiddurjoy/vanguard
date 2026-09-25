"""Simulate a phone call to the hotline or the helpline, without Twilio or a phone.

Plays Twilio's part on ``/telephony/media``: streams recorded caller turns as
μ-law audio in real time (silence in between, as a real line does), "plays"
the line's replies and echoes each mark once its audio would have finished,
and saves the call as a stereo WAV: left is the caller, right is the line.

    .venv/bin/python -m scripts.simulate_call turn1.wav turn2.wav ...
        [--line intake|helpline] [--lang bn|en] [--caller 01712345318]
        [--url ws://localhost:8000/telephony/media] [--out call.wav]

Each WAV is one caller turn, 8 kHz mono 16-bit PCM. Convert a recording with:

    ffmpeg -i answer.m4a -ar 8000 -ac 1 -c:a pcm_s16le answer.wav

Each turn is played after the previous reply has finished. The server needs
ElevenLabs (the voice) and OPENAI_API_KEY (speech-to-text); start it with
LOG_LEVEL=DEBUG to see what it heard and what it replied, and keep
TWILIO_VALIDATE_SIGNATURES=false. An intake call that reaches the problem
files a real application and sends its SMS notices: keep SMS_DRY_RUN=true.
"""

import argparse
import asyncio
import base64
import json
import sys
import time
import uuid
import wave
from array import array
from datetime import datetime
from pathlib import Path
from typing import Any

from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

from app.services.audio import FRAME_SAMPLES, SAMPLE_RATE, pcm16_bytes, ulaw_decode, ulaw_encode

FRAME_SECONDS = FRAME_SAMPLES / SAMPLE_RATE
SILENCE = b"\xff" * FRAME_SAMPLES
REPLY_QUIET_SECONDS = 1.0  # a reply is over once the line has been quiet this long
REPLY_TIMEOUT_SECONDS = 45.0


def read_turn(path: Path) -> bytes:
    """A caller turn as μ-law bytes."""
    with wave.open(str(path), "rb") as w:
        if (w.getnchannels(), w.getsampwidth(), w.getframerate()) != (1, 2, SAMPLE_RATE):
            raise SystemExit(
                f"{path}: needs 8 kHz mono 16-bit PCM. Convert it with:\n"
                f"  ffmpeg -i {path} -ar 8000 -ac 1 -c:a pcm_s16le {path.stem}-8k.wav"
            )
        samples = array("h")
        samples.frombytes(w.readframes(w.getnframes()))
    if sys.byteorder == "big":
        samples.byteswap()
    return ulaw_encode(samples)


def write_stereo(path: Path, left: array, right: array) -> None:
    length = max(len(left), len(right))
    stereo = array("h", bytes(4 * length))
    stereo[0 : 2 * len(left) : 2] = left
    stereo[1 : 2 * len(right) : 2] = right
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm16_bytes(stereo))


class SimulatedCall:
    def __init__(self, ws: Any, stream_sid: str):
        self.ws = ws
        self.stream_sid = stream_sid
        self.started = time.monotonic()
        self.caller = array("h")  # what the caller sent, in real time
        self.line = array("h")  # what the line played, where it played
        self.playback_end = 0.0  # when the audio queued so far finishes playing
        self.last_audio_at = 0.0
        self.marks_played = 0
        self.turns: asyncio.Queue[bytes] = asyncio.Queue()
        self.turn_sent = asyncio.Event()
        self.ended = asyncio.Event()

    def now(self) -> float:
        return time.monotonic() - self.started

    async def send(self, event: dict[str, Any]) -> None:
        try:
            await self.ws.send(json.dumps(event))
        except ConnectionClosed:
            self.ended.set()

    async def stream_caller(self) -> None:
        """Like Twilio: one 20 ms frame after another, the caller's turn when there is one."""
        pending = b""
        next_frame = time.monotonic()
        while not self.ended.is_set():
            if not pending and not self.turns.empty():
                pending = self.turns.get_nowait()
            frame, pending = pending[:FRAME_SAMPLES], pending[FRAME_SAMPLES:]
            if not frame:
                frame = SILENCE
            elif not pending:
                self.turn_sent.set()
            frame = frame.ljust(FRAME_SAMPLES, b"\xff")
            payload = base64.b64encode(frame).decode()
            await self.send(
                {
                    "event": "media",
                    "streamSid": self.stream_sid,
                    "media": {"track": "inbound", "payload": payload},
                }
            )
            self.caller.extend(ulaw_decode(frame))
            next_frame += FRAME_SECONDS
            await asyncio.sleep(max(0.0, next_frame - time.monotonic()))

    async def listen(self) -> None:
        try:
            async for raw in self.ws:
                message = json.loads(raw)
                event = message.get("event")
                if event == "media":
                    self._play(base64.b64decode(message["media"]["payload"]))
                elif event == "mark":
                    delay = max(0.0, self.playback_end - self.now())
                    asyncio.get_running_loop().call_later(
                        delay,
                        lambda name=message["mark"]["name"]: asyncio.ensure_future(
                            self._mark_played(name)
                        ),
                    )
                elif event == "clear":
                    # Barge-in: whatever had not played yet never will.
                    del self.line[int(self.now() * SAMPLE_RATE) :]
                    self.playback_end = self.now()
                    print(f"{self.now():6.1f}s  the line stopped talking (caller interrupted)")
        except ConnectionClosed:
            pass
        finally:
            self.ended.set()

    def _play(self, ulaw: bytes) -> None:
        start = max(self.now(), self.playback_end)
        if self.playback_end <= self.now():
            print(f"{self.now():6.1f}s  line: speaking")
        position = int(start * SAMPLE_RATE)
        if len(self.line) < position:
            self.line.extend(bytes(2 * (position - len(self.line))))
        del self.line[position:]
        self.line.extend(ulaw_decode(ulaw))
        self.playback_end = start + len(ulaw) / SAMPLE_RATE
        self.last_audio_at = self.now()

    async def _mark_played(self, name: str) -> None:
        self.marks_played += 1
        print(f"{self.now():6.1f}s  line: finished ({name})")
        await self.send({"event": "mark", "streamSid": self.stream_sid, "mark": {"name": name}})

    async def say(self, ulaw: bytes) -> None:
        self.turn_sent.clear()
        await self.turns.put(ulaw)
        await self.turn_sent.wait()

    async def wait_for_reply(self, marks_before: int) -> bool:
        deadline = time.monotonic() + REPLY_TIMEOUT_SECONDS
        while time.monotonic() < deadline and not self.ended.is_set():
            quiet_since = max(self.playback_end, self.last_audio_at)
            if self.marks_played > marks_before and self.now() - quiet_since >= REPLY_QUIET_SECONDS:
                return True
            await asyncio.sleep(0.05)
        return self.ended.is_set()


async def simulate(args: argparse.Namespace) -> None:
    turns = [(path, read_turn(path)) for path in args.turns]
    stream_sid = "MZsim" + uuid.uuid4().hex[:24]
    call_sid = "CAsim" + uuid.uuid4().hex[:24]
    parameters = {"language": args.lang}
    if args.line == "helpline":
        parameters["line"] = "helpline"
    if args.caller:
        parameters["caller"] = args.caller

    async with connect(args.url) as ws:
        call = SimulatedCall(ws, stream_sid)
        await call.send({"event": "connected", "protocol": "Call", "version": "1.0.0"})
        await call.send(
            {
                "event": "start",
                "streamSid": stream_sid,
                "start": {
                    "streamSid": stream_sid,
                    "callSid": call_sid,
                    "tracks": ["inbound"],
                    "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1},
                    "customParameters": parameters,
                },
            }
        )
        print(f"Calling the {args.line} line ({args.lang}), call {call_sid}")
        tasks = [asyncio.create_task(call.listen()), asyncio.create_task(call.stream_caller())]

        if not await call.wait_for_reply(0):
            print("No greeting. Is ElevenLabs configured on the server?")
        for number, (path, audio) in enumerate(turns, 1):
            if call.ended.is_set():
                print(f"The call ended before turn {number}.")
                break
            print(
                f"{call.now():6.1f}s  caller: turn {number}, {path.name} ({len(audio) / 8000:.1f}s)"
            )
            marks_before = call.marks_played
            await call.say(audio)
            if not await call.wait_for_reply(marks_before):
                print(f"No reply to turn {number} within {REPLY_TIMEOUT_SECONDS:.0f}s.")

        if not call.ended.is_set():
            await call.send(
                {"event": "stop", "streamSid": stream_sid, "stop": {"callSid": call_sid}}
            )
            print(f"{call.now():6.1f}s  caller hung up")
        else:
            print(f"{call.now():6.1f}s  the line hung up")
        call.ended.set()
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    out = args.out or Path(f"call-{datetime.now():%Y%m%d-%H%M%S}.wav")
    write_stereo(out, call.caller, call.line)
    print(f"Saved {out} (left: caller, right: the line)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("turns", nargs="*", type=Path, help="caller turns, 8 kHz mono WAV")
    parser.add_argument("--line", choices=("intake", "helpline"), default="intake")
    parser.add_argument("--lang", choices=("bn", "en"), default="bn")
    parser.add_argument("--caller", help="caller ID, as Twilio would pass it")
    parser.add_argument("--url", default="ws://localhost:8000/telephony/media")
    parser.add_argument(
        "--out", type=Path, help="where to save the call (default: call-<time>.wav)"
    )
    asyncio.run(simulate(parser.parse_args()))


if __name__ == "__main__":
    main()
