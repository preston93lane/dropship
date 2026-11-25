import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { defaultTheme, fontFamily, type Theme } from "./theme";

export type KineticHookProps = { width: number; height: number; fps: number; lines: string[]; secondsPerLine?: number; theme?: Partial<Theme> };

export const kineticDuration = (p: KineticHookProps) => Math.ceil(p.lines.length * (p.secondsPerLine ?? 0.7) * p.fps + p.fps * 0.4);

/** 1.5-3s text-only pattern interrupt to prepend to any ad ("STOP." / "scrolling" / "your desk is a mess"). */
export const KineticHook: React.FC<KineticHookProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const theme = { ...defaultTheme, ...(p.theme ?? {}) };
  const per = (p.secondsPerLine ?? 0.7) * fps;
  const i = Math.min(Math.floor(frame / per), p.lines.length - 1);
  const local = frame - i * per;
  const s = spring({ frame: local, fps, config: { damping: 9, stiffness: 260, mass: 0.6 } });
  const bg = i % 2 === 0 ? theme.accent : theme.background;
  const fg = i % 2 === 0 ? theme.accentText : theme.text;
  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily, fontWeight: 900, color: fg, fontSize: width * 0.13, lineHeight: 1, letterSpacing: -3, textAlign: "center", padding: "0 8%", transform: `scale(${interpolate(s, [0, 1], [1.6, 1])}) rotate(${interpolate(s, [0, 1], [8, 0])}deg)`, opacity: s }}>
        {p.lines[i]}
      </div>
    </AbsoluteFill>
  );
};
