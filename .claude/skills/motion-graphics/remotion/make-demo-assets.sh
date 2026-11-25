#!/usr/bin/env bash
# Generates placeholder assets in public/demo/ so the default props render without any API keys.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p public/demo
ffmpeg -v error -y -f lavfi -i "testsrc2=size=1080x1920:rate=30:duration=4" -pix_fmt yuv420p -c:v libx264 -preset veryfast public/demo/hook.mp4
ffmpeg -v error -y -f lavfi -i "color=c=black@0.0:s=900x900,format=rgba" -f lavfi -i "color=c=0x26282d:s=660x240" \
  -f lavfi -i "color=c=0xd9a441:s=600x180" -f lavfi -i "color=c=0x26282d:s=500x60" \
  -filter_complex "[0][1]overlay=120:330[a];[a][2]overlay=150:360[b];[b][3]overlay=200:420,format=rgba" \
  -frames:v 1 public/demo/product.png
python3 - <<'PY'
import json, wave, struct, math
words = "My desk was chaos. Six cables, one magnetic strip, ten seconds. Tap the link.".split()
t, out = 0.15, []
for w in words:
    d = 0.18 + 0.045 * len(w)
    out.append({"text": w, "start": round(t, 3), "end": round(t + d * 0.9, 3)}); t += d
json.dump(out, open("public/demo/words.json", "w"), indent=1)
sr = 48000; n = int(sr * (t + 0.4))
with wave.open("public/demo/vo.wav", "w") as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr)
    f.writeframes(b"".join(struct.pack("<h", int(1500 * math.sin(2 * math.pi * 220 * i / sr))) for i in range(n)))
PY
ffmpeg -v error -y -i public/demo/vo.wav -c:a libmp3lame -q:a 4 public/demo/vo.mp3 && rm public/demo/vo.wav
ffmpeg -v error -y -f lavfi -i "sine=frequency=110:duration=20" -af volume=0.3 -c:a libmp3lame -q:a 5 public/demo/music.mp3
echo "demo assets ready in public/demo/"
