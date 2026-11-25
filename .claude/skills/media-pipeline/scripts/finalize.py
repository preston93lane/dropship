#!/usr/bin/env python3
"""
Platform-ready export for any rendered video (Remotion output, fal clip, edited master).

  finalize.py in.mp4 out.mp4 [--lufs -14] [--variants 4:5,1:1]

- Two-pass EBU R128 loudness normalization to -14 LUFS (TikTok/Reels/Meta sweet spot), true peak -1.5 dB
- H.264 High, yuv420p, AAC 48k, +faststart (instant start on mobile)
- Optional 4:5 / 1:1 variants by centre crop (only use when captions/text sit in the middle 60% of the frame;
  otherwise re-render the composition at the target size, which re-lays out the text)
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


def measure(path: Path, target: float) -> dict | None:
    p = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", f"loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", p.stderr, re.S)
    return json.loads(m.group(0)) if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--lufs", type=float, default=-14.0)
    ap.add_argument("--variants", default="", help="comma list of 4:5,1:1 (centre crop)")
    args = ap.parse_args()
    src, dst = Path(args.src), Path(args.dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    has_audio = any(s["codec_type"] == "audio" for s in ffprobe_json(src)["streams"])
    vcodec = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    if has_audio:
        m = measure(src, args.lufs)
        if m and m.get("input_i") not in (None, "-inf"):
            af = (f"loudnorm=I={args.lufs}:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
                  f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
        else:
            af = f"loudnorm=I={args.lufs}:TP=-1.5:LRA=11"
        run(["ffmpeg", "-y", "-i", str(src), "-af", f"{af},aresample=48000", *vcodec, "-c:a", "aac", "-b:a", "192k", str(dst)])
    else:
        run(["ffmpeg", "-y", "-i", str(src), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", *vcodec, "-c:a", "aac", "-b:a", "128k", str(dst)])
    out = {"master": str(dst), "variants": {}}
    for v in filter(None, args.variants.split(",")):
        num, den = (int(x) for x in v.split(":"))
        vp = dst.with_name(f"{dst.stem}_{num}x{den}{dst.suffix}")
        run(["ffmpeg", "-y", "-i", str(dst), "-vf", f"crop=iw:iw*{den}/{num}", *vcodec, "-c:a", "copy", str(vp)])
        out["variants"][v] = str(vp)
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
