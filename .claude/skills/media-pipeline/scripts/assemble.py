#!/usr/bin/env python3
"""
ffmpeg ad editor: clips + voiceover + word-timed captions + hook text + callouts + music -> finished ad.

  assemble.py edl.json            # renders the master and every variant listed in the EDL

EDL (paths relative to the EDL file):
{
  "size": [1080, 1920], "fps": 30,
  "clips": [
    {"src": "shots/hook.mp4", "in": 0.0, "duration": 2.4},
    {"src": "source/product.jpg", "duration": 2.0, "motion": "zoom_in"},     # stills get Ken Burns motion
    {"src": "endcard.png", "duration": 1.6, "motion": "none"}
  ],
  "voiceover": "vo/vo.mp3", "voiceover_offset": 0.1,
  "words": "vo/words.json",
  "music": {"src": "music.mp3", "volume": 0.16},
  "hook": {"text": "My desk was a cable nightmare", "start": 0.0, "end": 2.2},
  "captions": {"max_words": 3, "y": 0.64, "highlight": "#FFE14D", "uppercase": false},
  "callouts": [{"text": "Holds 6 cables", "start": 3.0, "end": 5.0, "y": 0.28}],
  "loudness": -14,
  "out": "out/final_9x16.mp4",
  "variants": {"4:5": [1080, 1350], "1:1": [1080, 1080]}
}

Caption/hook/callout positions are fractions of frame height, kept inside TikTok/Reels safe zones
(avoid the bottom ~20% and right ~15%). Prefer the Remotion AdVideo composition for motion-heavy ads;
this script is the fast path and the fallback.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import log, media_duration, run  # noqa: E402

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}


def pick_font() -> str:
    try:
        fonts = subprocess.run(["fc-list", ":", "family"], capture_output=True, text=True).stdout
    except FileNotFoundError:
        return "Sans"
    for family in ("Inter", "Montserrat", "Poppins", "DejaVu Sans", "Liberation Sans"):
        if family in fonts:
            return family
    return "Sans"


def ass_color(hex_color: str, alpha: int = 0) -> str:
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{alpha:02X}{b}{g}{r}".upper().replace("&H", "&H", 1)


def ass_time(t: float) -> str:
    t = max(t, 0)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def clean(text: str) -> str:
    return re.sub(r"[{}\\]", "", text).strip()


def chunk_words(words: list[dict], max_words: int) -> list[list[dict]]:
    chunks: list[list[dict]] = []
    cur: list[dict] = []
    for w in words:
        cur.append(w)
        ends_sentence = bool(re.search(r"[.!?,;:]$", w["text"]))
        if len(cur) >= max_words or ends_sentence:
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return chunks


def build_ass(edl: dict, size: tuple[int, int], base: Path) -> str:
    W, H = size
    font = edl.get("font") or pick_font()
    cap = {"max_words": 3, "y": 0.64, "highlight": "#FFE14D", "uppercase": False, **edl.get("captions", {})}
    cap_size = int(W * cap.get("size", 0.074))
    hook_size = int(W * 0.075)
    call_size = int(W * 0.052)
    accent = edl.get("accent", "#FFE14D")
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{font},{cap_size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,{max(4, cap_size // 11)},2,5,{int(W*0.08)},{int(W*0.16)},0,1
Style: Hook,{font},{hook_size},&H00111111,&H00111111,&H00FFFFFF,&H00FFFFFF,1,0,0,0,100,100,0,0,3,{int(hook_size*0.28)},0,5,{int(W*0.07)},{int(W*0.12)},0,1
Style: Callout,{font},{call_size},&H00111111,&H00111111,{ass_color(accent)},{ass_color(accent)},1,0,0,0,100,100,0,0,3,{int(call_size*0.35)},0,5,{int(W*0.08)},{int(W*0.16)},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    cx = int(W * 0.46)  # shifted left of center to stay clear of the right-side action icons

    hook = edl.get("hook")
    if hook and hook.get("text"):
        y = int(H * hook.get("y", 0.2))
        events.append(f"Dialogue: 2,{ass_time(hook.get('start', 0))},{ass_time(hook.get('end', 2.2))},Hook,,0,0,0,,{{\\an5\\pos({cx},{y})\\fad(80,120)}}{clean(hook['text'])}")

    for c in edl.get("callouts", []):
        y = int(H * c.get("y", 0.28))
        events.append(f"Dialogue: 1,{ass_time(c['start'])},{ass_time(c['end'])},Callout,,0,0,0,,{{\\an5\\pos({cx},{y})\\fad(120,120)}}{clean(c['text'])}")

    words_file = edl.get("words")
    if words_file:
        offset = float(edl.get("voiceover_offset", 0.0))
        words = [{**w, "start": w["start"] + offset, "end": w["end"] + offset} for w in json.loads((base / words_file).read_text())]
        hl = ass_color(cap["highlight"])
        y = int(H * cap["y"])
        chunks = chunk_words(words, int(cap["max_words"]))
        for i, ch in enumerate(chunks):
            chunk_end = chunks[i + 1][0]["start"] if i + 1 < len(chunks) and chunks[i + 1][0]["start"] - ch[-1]["end"] < 0.35 else ch[-1]["end"] + 0.15
            for j, w in enumerate(ch):
                start = w["start"]
                end = ch[j + 1]["start"] if j + 1 < len(ch) else chunk_end
                parts = []
                for k, x in enumerate(ch):
                    t = clean(x["text"])
                    t = t.upper() if cap.get("uppercase") else t
                    parts.append(f"{{\\c{hl}}}{t}{{\\c&H00FFFFFF&}}" if k == j else t)
                pop = "\\fscx104\\fscy104" if j == 0 else ""
                events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Caption,,0,0,0,,{{\\an5\\pos({cx},{y}){pop}}}{' '.join(parts)}")
    return header + "\n".join(events) + "\n"


def render(edl: dict, base: Path, size: tuple[int, int], out_path: Path) -> dict:
    W, H = size
    fps = int(edl.get("fps", 30))
    work = Path(tempfile.mkdtemp(prefix="assemble_"))
    try:
        segs: list[Path] = []
        for i, clip in enumerate(edl["clips"]):
            src = base / clip["src"]
            seg = work / f"seg_{i:02d}.mp4"
            dur = float(clip.get("duration") or 0)
            cover = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"
            if src.suffix.lower() in IMAGE_EXT:
                dur = dur or 2.0
                frames = max(int(dur * fps), 1)
                motion = clip.get("motion", "zoom_in")
                if motion == "none":
                    vf = f"{cover},fps={fps},setsar=1,format=yuv420p"
                    run(["ffmpeg", "-y", "-loop", "1", "-framerate", str(fps), "-t", f"{dur}", "-i", str(src), "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-r", str(fps), str(seg)])
                else:
                    z = "min(zoom+0.0009,1.12)" if motion == "zoom_in" else "if(eq(on,0),1.12,max(zoom-0.0009,1.0))"
                    vf = (f"scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},"
                          f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={fps},setsar=1,format=yuv420p")
                    run(["ffmpeg", "-y", "-i", str(src), "-vf", vf, "-frames:v", str(frames), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", str(seg)])
            else:
                start = float(clip.get("in", 0))
                dur = dur or (media_duration(src) - start)
                speed = float(clip.get("speed", 1.0))
                vf = f"{cover},setpts=PTS/{speed},fps={fps},setsar=1,format=yuv420p"
                run(["ffmpeg", "-y", "-ss", f"{start}", "-t", f"{dur * speed}", "-i", str(src), "-vf", vf, "-an", "-t", f"{dur}", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-r", str(fps), str(seg)])
            segs.append(seg)

        listing = work / "concat.txt"
        listing.write_text("".join(f"file '{s}'\n" for s in segs))
        base_video = work / "base.mp4"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(base_video)])
        video_dur = media_duration(base_video)

        vo = edl.get("voiceover")
        vo_path = base / vo if vo else None
        vo_off = float(edl.get("voiceover_offset", 0.0))
        total = video_dur
        if vo_path:
            total = max(video_dur, media_duration(vo_path) + vo_off + 0.3)
        pad = max(total - video_dur, 0)

        ass_file = work / "overlay.ass"
        ass_file.write_text(build_ass(edl, size, base))

        # ---- audio graph ----
        inputs: list[str] = []
        graph: list[str] = []
        idx = 1  # 0 is the video
        fmt = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
        vo_label = mus_label = None
        if vo_path:
            inputs += ["-i", str(vo_path)]
            graph.append(f"[{idx}:a]{fmt},adelay={int(vo_off*1000)}|{int(vo_off*1000)},apad=whole_dur={total}[vo]")
            vo_label = "vo"
            idx += 1
        music = edl.get("music")
        if music and music.get("src"):
            inputs += ["-stream_loop", "-1", "-i", str(base / music["src"])]
            graph.append(f"[{idx}:a]{fmt},atrim=0:{total},volume={music.get('volume', 0.16)},afade=t=out:st={max(total-0.6, 0)}:d=0.6[mus]")
            mus_label = "mus"
            idx += 1
        loud = f"loudnorm=I={edl.get('loudness', -14)}:TP=-1.5:LRA=11"
        if vo_label and mus_label:
            graph.append("[vo]asplit=2[vo_a][vo_sc]")
            graph.append("[mus][vo_sc]sidechaincompress=threshold=0.04:ratio=8:attack=15:release=350[duck]")
            graph.append(f"[vo_a][duck]amix=inputs=2:duration=first:normalize=0,{loud}[aout]")
        elif vo_label:
            graph.append(f"[vo]{loud}[aout]")
        elif mus_label:
            graph.append(f"[mus]{loud}[aout]")
        else:
            inputs += ["-f", "lavfi", "-t", f"{total}", "-i", "anullsrc=r=48000:cl=stereo"]
            graph.append(f"[{idx}:a]anull[aout]")

        vf = f"[0:v]tpad=stop_mode=clone:stop_duration={pad:.3f},ass={ass_file}[vout]"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        cmd = ["ffmpeg", "-y", "-i", str(base_video), *inputs, "-filter_complex", ";".join([vf, *graph]),
               "-map", "[vout]", "-map", "[aout]", "-t", f"{total:.3f}",
               "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", str(fps),
               "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(out_path)]
        run(cmd)
        return {"file": str(out_path), "duration": round(media_duration(out_path), 2), "size": [W, H]}
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    edl_path = Path(sys.argv[1]).resolve()
    base = edl_path.parent
    edl = json.loads(edl_path.read_text())
    size = tuple(edl.get("size", [1080, 1920]))
    master = base / edl.get("out", "out/final.mp4")
    log(f"rendering master {size[0]}x{size[1]} -> {master}")
    result = {"master": render(edl, base, size, master), "variants": {}}
    for name, vsize in (edl.get("variants") or {}).items():
        vpath = master.with_name(f"{master.stem}_{name.replace(':', 'x')}{master.suffix}")
        log(f"rendering variant {name} -> {vpath}")
        result["variants"][name] = render(edl, base, tuple(vsize), vpath)
    thumb = master.with_suffix(".jpg")
    run(["ffmpeg", "-y", "-ss", "0.4", "-i", str(master), "-frames:v", "1", "-q:v", "3", str(thumb)])
    result["thumbnail"] = str(thumb)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
