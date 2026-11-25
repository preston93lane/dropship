"""Shared helpers for the media pipeline. Python 3 stdlib only (runs anywhere with ffmpeg)."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REGISTRY_FILE = HERE.parent / "models.json"


def log(msg: str) -> None:
    print(f"[media] {msg}", file=sys.stderr)


def load_registry() -> dict:
    return json.loads(REGISTRY_FILE.read_text())


def find_model(endpoint_or_key: str) -> dict | None:
    """Look up a registry entry by fal endpoint id or by '<group>.<key>' (e.g. 'video.hero_i2v')."""
    reg = load_registry()
    if "." in endpoint_or_key and "/" not in endpoint_or_key:
        group, key = endpoint_or_key.split(".", 1)
        return reg.get(group, {}).get(key)
    for group in ("video", "image", "audio"):
        for entry in reg.get(group, {}).values():
            if entry.get("endpoint") == endpoint_or_key:
                return entry
    return None


def resolve_endpoint(endpoint_or_key: str) -> str:
    m = find_model(endpoint_or_key) if "/" not in endpoint_or_key else None
    return m["endpoint"] if m else endpoint_or_key


def http_json(method: str, url: str, body: dict | None = None, headers: dict | None = None, retries: int = 3, timeout: int = 120) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"content-type": "application/json", **(headers or {})}
    last: Exception | None = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")[:1500]
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"{method} {url} -> HTTP {e.code}: {text}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            if attempt < retries:
                time.sleep(2 ** attempt)
                continue
    raise RuntimeError(f"{method} {url} failed: {last}")


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=300) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)
    return dest


def run(cmd: list[str], quiet: bool = True) -> str:
    """Run a command (ffmpeg/ffprobe); raise with stderr on failure."""
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"command failed ({p.returncode}): {' '.join(cmd[:6])}...\n{p.stderr[-2500:]}")
    if not quiet:
        log(p.stderr[-500:])
    return p.stdout


def ffprobe_json(path: Path) -> dict:
    return json.loads(run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)]))


def media_duration(path: Path) -> float:
    return float(ffprobe_json(path)["format"].get("duration", 0.0))


def placeholder(kind: str, dest: Path, *, seconds: float = 5.0, size: tuple[int, int] = (1080, 1920), label: str = "DRY RUN") -> Path:
    """Generate stand-in media with ffmpeg so the whole pipeline runs without API keys."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    w, h = size
    safe = "".join(c for c in label if c.isalnum() or c in " -_")[:40] or "DRY RUN"
    if kind == "video":
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"testsrc2=size={w}x{h}:rate=30:duration={seconds}",
             "-vf", f"drawtext=text='{safe}':fontcolor=white:fontsize={w // 14}:x=(w-tw)/2:y=h*0.45:box=1:boxcolor=black@0.5",
             "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "veryfast", str(dest)])
    elif kind == "image":
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=0x3a6ea5:size={w}x{h}:duration=1",
             "-vf", f"drawtext=text='{safe}':fontcolor=white:fontsize={w // 12}:x=(w-tw)/2:y=(h-th)/2",
             "-frames:v", "1", str(dest)])
    elif kind == "audio":
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency=220:duration={seconds}", "-af", "volume=0.05",
             "-c:a", "libmp3lame", "-q:a", "4", str(dest)])
    else:
        raise ValueError(kind)
    return dest


def gateway(method: str, path: str, body: dict | None = None) -> dict | None:
    """Best-effort call to the gateway (cost logging, uploads). Returns None if not configured."""
    url = os.environ.get("GATEWAY_URL")
    key = os.environ.get("GATEWAY_KEY")
    if not url or not key:
        env_file = Path(__file__).resolve().parents[2] / "gateway-api" / "gateway.env"
        if env_file.exists() and not url:
            for line in env_file.read_text().splitlines():
                if line.startswith("GATEWAY_URL=") and "YOUR_PROJECT_REF" not in line:
                    url = line.split("=", 1)[1].strip().strip('"').split(":-", 1)[-1].rstrip("}")
        if not url or not key:
            return None
    headers = {"authorization": f"Bearer {key}", "x-agent": os.environ.get("AGENT_NAME", "media-pipeline")}
    return http_json(method, url.rstrip("/") + path, body, headers, retries=1)


def log_cost(vendor: str, amount: float, ref: str) -> None:
    if amount <= 0:
        return
    try:
        gateway("POST", "/v1/costs", {"category": "media", "vendor": vendor, "amount": round(amount, 4), "ref": ref})
    except Exception as e:  # cost logging must never break production
        log(f"cost log failed: {e}")


def estimate_cost(entry: dict | None, *, seconds: float = 0, images: int = 1, chars: int = 0, minutes: float = 0, audio: bool = False) -> float:
    if not entry:
        return 0.0
    unit, price = entry.get("unit"), entry.get("price_with_audio" if audio and "price_with_audio" in entry else "price", 0)
    qty = {"second": seconds, "image": images, "1k_chars": chars / 1000, "minute": minutes}.get(unit, 0)
    return round(price * qty, 4)
