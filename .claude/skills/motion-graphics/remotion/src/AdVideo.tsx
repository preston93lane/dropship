import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, Series, useCurrentFrame, useVideoConfig } from "remotion";
import { Callout } from "./components/Callout";
import { Captions, type Word } from "./components/Captions";
import { EndCard, type EndCardProps } from "./components/EndCard";
import { HookText } from "./components/HookText";
import { asset, defaultTheme, type Theme } from "./theme";

export type Clip = {
  src: string; // video or image (public/ name or URL)
  type: "video" | "image";
  duration: number; // seconds on screen
  startFrom?: number; // seconds into the source video
  motion?: "zoom_in" | "zoom_out" | "pan" | "none"; // stills only
  playbackRate?: number;
};

export type AdVideoProps = {
  width: number;
  height: number;
  fps: number;
  clips: Clip[];
  voiceover?: string;
  voiceoverOffset?: number;
  words?: Word[];
  music?: { src: string; volume?: number };
  hook?: { text: string; start?: number; end: number; y?: number };
  callouts?: { text: string; start: number; end: number; y?: number; icon?: string }[];
  captions?: { y?: number; maxWords?: number; uppercase?: boolean; enabled?: boolean };
  endCard?: EndCardProps & { duration: number };
  theme?: Partial<Theme>;
  progressBar?: boolean;
};

export const adDurationInFrames = (p: AdVideoProps): number => {
  const clips = p.clips.reduce((s, c) => s + c.duration, 0);
  const vo = p.words?.length ? p.words[p.words.length - 1]!.end + (p.voiceoverOffset ?? 0) + 0.3 : 0;
  return Math.ceil((Math.max(clips, vo) + (p.endCard?.duration ?? 0)) * p.fps);
};

const ClipView: React.FC<{ clip: Clip }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fill: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
  if (clip.type === "video") {
    return <OffthreadVideo src={asset(clip.src)} muted startFrom={Math.round((clip.startFrom ?? 0) * fps)} playbackRate={clip.playbackRate ?? 1} style={fill} />;
  }
  const p = frame / Math.max(clip.duration * fps, 1);
  const m = clip.motion ?? "zoom_in";
  const scale = m === "zoom_in" ? interpolate(p, [0, 1], [1, 1.12]) : m === "zoom_out" ? interpolate(p, [0, 1], [1.12, 1]) : m === "pan" ? 1.12 : 1;
  const x = m === "pan" ? interpolate(p, [0, 1], [-4, 4]) : 0;
  return <Img src={asset(clip.src)} style={{ ...fill, transform: `scale(${scale}) translateX(${x}%)` }} />;
};

/** Master ad template: footage track + VO + ducked music + hook + callouts + word captions + end card. */
export const AdVideo: React.FC<AdVideoProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const theme = { ...defaultTheme, ...(props.theme ?? {}) };
  const words = props.words ?? [];
  const offset = props.voiceoverOffset ?? 0;
  const endFrames = Math.round((props.endCard?.duration ?? 0) * fps);
  const bodyFrames = durationInFrames - endFrames;
  const speaking = (f: number) => words.some((w) => f / fps >= w.start + offset - 0.05 && f / fps <= w.end + offset + 0.15);
  const clipFrames = props.clips.map((c) => Math.max(1, Math.round(c.duration * fps)));
  const clipTotal = clipFrames.reduce((a, b) => a + b, 0);

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Series>
        {props.clips.map((c, i) => (
          // the last clip holds until the end card if the VO runs longer than the footage
          <Series.Sequence key={i} durationInFrames={i === props.clips.length - 1 ? clipFrames[i]! + Math.max(0, bodyFrames - clipTotal) : clipFrames[i]!}>
            <ClipView clip={c} />
          </Series.Sequence>
        ))}
      </Series>

      {props.voiceover ? (
        <Sequence from={Math.round(offset * fps)}>
          <Audio src={asset(props.voiceover)} />
        </Sequence>
      ) : null}
      {props.music ? (
        <Audio
          src={asset(props.music.src)}
          loop
          volume={(f) => {
            const base = props.music?.volume ?? 0.16;
            const fadeOut = interpolate(f, [durationInFrames - fps * 0.6, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            return (speaking(f) ? base * 0.45 : base) * fadeOut; // duck under the voice
          }}
        />
      ) : null}

      {props.hook ? (
        <Sequence from={Math.round((props.hook.start ?? 0) * fps)} durationInFrames={Math.round((props.hook.end - (props.hook.start ?? 0)) * fps)}>
          <HookText text={props.hook.text} y={props.hook.y ?? 0.2} durationInFrames={Math.round((props.hook.end - (props.hook.start ?? 0)) * fps)} />
        </Sequence>
      ) : null}

      {(props.callouts ?? []).map((c, i) => {
        const d = Math.round((c.end - c.start) * fps);
        return (
          <Sequence key={i} from={Math.round(c.start * fps)} durationInFrames={d}>
            <Callout text={c.text} y={c.y ?? 0.3} icon={c.icon ?? "✓"} theme={theme} durationInFrames={d} />
          </Sequence>
        );
      })}

      {props.captions?.enabled !== false && words.length ? (
        <Sequence durationInFrames={bodyFrames}>
          <Captions words={words} theme={theme} y={props.captions?.y ?? 0.64} maxWords={props.captions?.maxWords ?? 3} uppercase={props.captions?.uppercase ?? false} offset={offset} />
        </Sequence>
      ) : null}

      {props.endCard ? (
        <Sequence from={bodyFrames}>
          <EndCard {...props.endCard} theme={theme} />
        </Sequence>
      ) : null}

      {props.progressBar ? (
        <AbsoluteFill>
          <div style={{ position: "absolute", top: 0, left: 0, height: 8, width: `${(frame / durationInFrames) * 100}%`, background: theme.accent }} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
