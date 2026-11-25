#!/usr/bin/env python3
"""
Run any fal.ai model through the queue API, download its outputs, estimate and log cost.

  fal_run.py --model video.hero_i2v --input '{"prompt": "...", "image_url": "https://...", "duration": "5"}' --out work/shot1
  fal_run.py --model fal-ai/birefnet/v2 --input @input.json --out work/cutout
  fal_run.py ... --dry-run           # placeholder media via ffmpeg, no API call, no cost

--model accepts a registry key (group.key from models.json) or a raw fal endpoint id.
Local files cannot be passed to fal directly: upload them first with upload.py and pass the public URL.
Prints a JSON summary to stdout: {endpoint, request_id, outputs[], est_cost, result}.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import download, estimate_cost, find_model, http_json, log, log_cost, placeholder, resolve_endpoint  # noqa: E402

MEDIA_EXT = {".mp4": "video", ".mov": "video", ".webm": "video", ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".mp3": "audio", ".wav": "audio", ".m4a": "audio"}


def collect_urls(obj, found: list[str]) -> list[str]:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "url" and isinstance(v, str) and v.startswith("http"):
                found.append(v)
            else:
                collect_urls(v, found)
    elif isinstance(obj, list):
        for v in obj:
            collect_urls(v, found)
    return found


def guess_kind(entry: dict | None, endpoint: str) -> str:
    text = endpoint + json.dumps(entry or {})
    if any(k in text for k in ("video", "i2v", "avatar")):
        return "video"
    if any(k in text for k in ("tts", "music", "speech")):
        return "audio"
    return "image"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True)
    ap.add_argument("--input", required=True, help="JSON string or @file.json")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--ref", default="", help="creative id / job ref for cost logging")
    args = ap.parse_args()

    payload = json.loads(Path(args.input[1:]).read_text() if args.input.startswith("@") else args.input)
    endpoint = resolve_endpoint(args.model)
    entry = find_model(args.model) or find_model(endpoint)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    seconds = float(str(payload.get("duration", payload.get("seconds", 5))).rstrip("s") or 5)
    est = estimate_cost(entry, seconds=seconds, images=int(payload.get("num_images", 1)), chars=len(str(payload.get("text", ""))), audio=bool(payload.get("generate_audio")))

    if args.dry_run or not os.environ.get("FAL_KEY"):
        if not args.dry_run:
            log("FAL_KEY not set: running in dry-run mode")
        kind = guess_kind(entry, endpoint)
        ext = {"video": "mp4", "image": "png", "audio": "mp3"}[kind]
        aspect = str(payload.get("aspect_ratio", "9:16"))
        size = {"9:16": (1080, 1920), "4:5": (1080, 1350), "1:1": (1080, 1080), "16:9": (1920, 1080)}.get(aspect, (1080, 1920))
        path = placeholder(kind, out / f"output.{ext}", seconds=seconds, size=size, label=endpoint.split("/")[-2] if "/" in endpoint else "dry run")
        print(json.dumps({"endpoint": endpoint, "request_id": "dry-run", "outputs": [str(path)], "est_cost": est, "dry_run": True}, indent=2))
        return 0

    headers = {"authorization": f"Key {os.environ['FAL_KEY']}"}
    sub = http_json("POST", f"https://queue.fal.run/{endpoint}", payload, headers)
    rid = sub.get("request_id")
    status_url = sub.get("status_url") or f"https://queue.fal.run/{endpoint}/requests/{rid}/status"
    response_url = sub.get("response_url") or f"https://queue.fal.run/{endpoint}/requests/{rid}"
    log(f"submitted {endpoint} request {rid} (est ${est})")
    deadline = time.time() + args.timeout
    delay = 2.0
    while True:
        st = http_json("GET", status_url, None, headers)
        status = st.get("status")
        if status == "COMPLETED":
            break
        if status in ("FAILED", "ERROR", "CANCELLED"):
            raise SystemExit(f"fal request {rid} {status}: {json.dumps(st)[:800]}")
        if time.time() > deadline:
            raise SystemExit(f"fal request {rid} timed out after {args.timeout}s (status {status})")
        time.sleep(delay)
        delay = min(delay * 1.5, 15)
    result = http_json("GET", response_url, None, headers)
    outputs = []
    for i, url in enumerate(dict.fromkeys(collect_urls(result, []))):
        ext = Path(url.split("?")[0]).suffix.lower() or ".bin"
        outputs.append(str(download(url, out / f"output_{i}{ext}")))
    (out / "result.json").write_text(json.dumps(result, indent=2))
    log_cost("fal", est, f"{args.ref or rid} {endpoint}")
    print(json.dumps({"endpoint": endpoint, "request_id": rid, "outputs": outputs, "est_cost": est, "result_file": str(out / "result.json")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
