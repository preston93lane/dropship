#!/usr/bin/env python3
"""
Voiceover + word-level timings in one step.

  voiceover.py --text "Your desk is a mess. This fixes it in ten seconds." --out work/vo
  voiceover.py --text-file script.txt --voice "Rachel" --model audio.tts_premium --out work/vo
  voiceover.py ... --dry-run

Writes <out>/vo.mp3 and <out>/words.json ([{"text","start","end"}...], seconds) for captions.
Timings come from transcribing the generated audio (fal ElevenLabs speech-to-text); if that fails,
words are spread evenly over the audio duration (good enough for drafts, not for finals).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import download, estimate_cost, find_model, http_json, log, log_cost, media_duration, placeholder, resolve_endpoint  # noqa: E402
from fal_run import collect_urls  # noqa: E402

WPS = 2.8  # natural ad VO pace, words per second


def fal_sync(endpoint: str, payload: dict) -> dict:
    """Queue + poll a fal request and return the result JSON."""
    import time
    headers = {"authorization": f"Key {os.environ['FAL_KEY']}"}
    sub = http_json("POST", f"https://queue.fal.run/{endpoint}", payload, headers)
    rid = sub["request_id"]
    status_url = sub.get("status_url") or f"https://queue.fal.run/{endpoint}/requests/{rid}/status"
    response_url = sub.get("response_url") or f"https://queue.fal.run/{endpoint}/requests/{rid}"
    for _ in range(300):
        st = http_json("GET", status_url, None, headers).get("status")
        if st == "COMPLETED":
            return http_json("GET", response_url, None, headers)
        if st in ("FAILED", "ERROR", "CANCELLED"):
            raise RuntimeError(f"{endpoint} {st}")
        time.sleep(2)
    raise RuntimeError(f"{endpoint} timed out")


def even_words(text: str, duration: float) -> list[dict]:
    words = re.findall(r"\S+", text)
    if not words:
        return []
    lead, tail = 0.15, 0.25
    span = max(duration - lead - tail, 0.5)
    weights = [max(len(w), 2) for w in words]
    total = sum(weights)
    t, out = lead, []
    for w, wt in zip(words, weights):
        d = span * wt / total
        out.append({"text": w, "start": round(t, 3), "end": round(t + d * 0.92, 3)})
        t += d
    return out


def extract_words(result: dict) -> list[dict]:
    """Find a word list in a transcription result regardless of exact schema."""
    best: list[dict] = []

    def walk(o):
        nonlocal best
        if isinstance(o, list) and o and isinstance(o[0], dict) and "start" in o[0] and ("text" in o[0] or "word" in o[0]):
            if len(o) > len(best):
                best = o
        elif isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(result)
    words = []
    for w in best:
        text = str(w.get("text", w.get("word", ""))).strip()
        if not text or w.get("type") in ("spacing", "audio_event"):
            continue
        words.append({"text": text, "start": float(w["start"]), "end": float(w.get("end", w["start"]))})
    return words


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--text")
    src.add_argument("--text-file")
    ap.add_argument("--voice", default="Rachel", help="voice name or id supported by the TTS endpoint")
    ap.add_argument("--model", default="audio.tts")
    ap.add_argument("--out", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--ref", default="")
    args = ap.parse_args()

    text = args.text if args.text is not None else Path(args.text_file).read_text().strip()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    vo = out / "vo.mp3"
    endpoint = resolve_endpoint(args.model)
    est = estimate_cost(find_model(args.model), chars=len(text))

    if args.dry_run or not os.environ.get("FAL_KEY"):
        if not args.dry_run:
            log("FAL_KEY not set: dry-run voiceover")
        seconds = round(len(text.split()) / WPS + 0.4, 2)
        placeholder("audio", vo, seconds=seconds)
        words = even_words(text, seconds)
        source = "dry-run"
    else:
        result = fal_sync(endpoint, {"text": text, "voice": args.voice})
        urls = collect_urls(result, [])
        if not urls:
            raise SystemExit(f"TTS returned no audio: {json.dumps(result)[:500]}")
        download(urls[0], vo)
        log_cost("fal", est, f"{args.ref} tts")
        try:
            stt = resolve_endpoint("audio.transcribe")
            tr = fal_sync(stt, {"audio_url": urls[0], "timestamps_granularity": "word", "diarize": False})
            words = extract_words(tr)
            log_cost("fal", estimate_cost(find_model("audio.transcribe"), minutes=media_duration(vo) / 60), f"{args.ref} stt")
            source = "transcription"
        except Exception as e:
            log(f"transcription failed ({e}); using even spacing")
            words = []
            source = "even"
        if not words:
            words = even_words(text, media_duration(vo))
    (out / "words.json").write_text(json.dumps(words, indent=1))
    print(json.dumps({"vo": str(vo), "words": str(out / "words.json"), "duration": round(media_duration(vo), 2), "word_count": len(words), "timing_source": source, "est_cost": est}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
