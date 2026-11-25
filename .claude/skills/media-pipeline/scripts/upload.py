#!/usr/bin/env python3
"""
Upload a local file to the public `creatives` bucket via the gateway and print its public URL.

  upload.py work/final_9x16.mp4 --path products/<product_id>/creatives/<slug>/final_9x16.mp4

Needs GATEWAY_URL + GATEWAY_KEY (vault). Against the local dev gateway it returns a fake URL.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import gateway  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--path", required=True, help="storage path, e.g. products/<id>/creatives/<slug>/final.mp4")
    args = ap.parse_args()
    f = Path(args.file)
    signed = gateway("POST", "/v1/assets/sign", {"path": args.path})
    if not signed:
        raise SystemExit("gateway not configured (GATEWAY_URL / GATEWAY_KEY)")
    if signed["uploadUrl"].startswith("memory://"):
        print(json.dumps({"public_url": signed["publicUrl"], "note": "dev gateway: not actually uploaded"}))
        return 0
    ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
    req = urllib.request.Request(signed["uploadUrl"], data=f.read_bytes(), method="PUT", headers={"content-type": ctype, "x-upsert": "true"})
    with urllib.request.urlopen(req, timeout=600) as r:
        if r.status >= 300:
            raise SystemExit(f"upload failed: HTTP {r.status}")
    print(json.dumps({"public_url": signed["publicUrl"], "bytes": f.stat().st_size}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
