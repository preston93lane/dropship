#!/usr/bin/env python3
"""
Technical QA for a finished video ad + keyframes for visual review.

  qa_video.py final.mp4                    # checks only
  qa_video.py final.mp4 --frames out/qa    # also extracts first frame, scene changes, last frame

Checks: resolution/aspect, fps, duration window, audio present, integrated loudness, bitrate/size.
Prints a JSON report; exit code 1 if any hard check fails. Always LOOK at the extracted frames
(the read tool shows images): product fidelity, text legibility, safe zones and AI artifacts can
only be judged visually.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ffprobe_json, run  # noqa: E402

SPECS = {
    "9:16": (1080, 1920),
    "4:5": (1080, 1350),
    "1:1": (1080, 1080),
}


def loudness(path: Path) -> float | None:
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"I:\s+(-?\d+(?:\.\d+)?) LUFS", p.stderr)
    return float(m[-1]) if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--frames", help="directory for extracted keyframes")
    ap.add_argument("--min", type=float, default=6.0, help="min duration (s)")
    ap.add_argument("--max", type=float, default=60.0, help="max duration (s)")
    args = ap.parse_args()
    path = Path(args.video)
    info = ffprobe_json(path)
    v = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    dur = float(info["format"]["duration"])
    size_mb = int(info["format"]["size"]) / 1e6
    fps_num, fps_den = (v["r_frame_rate"].split("/") + ["1"])[:2] if v else ("0", "1")
    fps = float(fps_num) / float(fps_den or 1)
    w, h = (v["width"], v["height"]) if v else (0, 0)
    aspect = next((k for k, (sw, sh) in SPECS.items() if sw * h == sh * w), f"{w}x{h}")
    lufs = loudness(path) if a else None

    checks = []
    def check(name: str, ok: bool, detail: str, hard: bool = True):
        checks.append({"check": name, "ok": ok, "detail": detail, "hard": hard})

    check("video stream", v is not None, v["codec_name"] if v else "missing")
    check("resolution", (w, h) in SPECS.values(), f"{w}x{h} ({aspect})")
    check("min width 1080", w >= 1080, f"{w}px")
    check("fps 24-60", 23.9 <= fps <= 60.1, f"{fps:.2f}")
    check("duration window", args.min <= dur <= args.max, f"{dur:.2f}s")
    check("audio track", a is not None, a["codec_name"] if a else "missing (platforms penalize silent video)")
    check("loudness -16..-12 LUFS", lufs is not None and -16.5 <= lufs <= -11.5, f"{lufs} LUFS" if lufs is not None else "n/a", hard=False)
    check("file size < 250MB", size_mb < 250, f"{size_mb:.1f}MB")
    check("pixel format yuv420p", (v or {}).get("pix_fmt") == "yuv420p", (v or {}).get("pix_fmt", "?"))

    frames: list[str] = []
    if args.frames:
        d = Path(args.frames)
        d.mkdir(parents=True, exist_ok=True)
        run(["ffmpeg", "-y", "-ss", "0.05", "-i", str(path), "-frames:v", "1", "-vf", "scale=540:-2", str(d / "00_first.jpg")])
        run(["ffmpeg", "-y", "-i", str(path), "-vf", "select='gt(scene,0.28)',scale=540:-2", "-vsync", "vfr", "-frames:v", "12", str(d / "scene_%02d.jpg")])
        run(["ffmpeg", "-y", "-sseof", "-0.3", "-i", str(path), "-frames:v", "1", "-vf", "scale=540:-2", str(d / "99_last.jpg")])
        frames = sorted(str(p) for p in d.glob("*.jpg"))

    hard_fail = [c for c in checks if c["hard"] and not c["ok"]]
    report = {"file": str(path), "duration": round(dur, 2), "size": [w, h], "aspect": aspect, "fps": round(fps, 2), "lufs": lufs, "size_mb": round(size_mb, 1),
              "pass": not hard_fail, "checks": checks, "frames": frames,
              "visual_review": "Open every frame: product identical to source? text >=48px-equivalent and inside safe zones? no AI artifacts on the product? first frame works as a thumbnail?"}
    print(json.dumps(report, indent=2))
    return 0 if not hard_fail else 1


if __name__ == "__main__":
    raise SystemExit(main())
