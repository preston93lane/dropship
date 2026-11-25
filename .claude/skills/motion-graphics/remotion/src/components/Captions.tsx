import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily, SAFE, type Theme } from "../theme";

export type Word = { text: string; start: number; end: number };

const pages = (words: Word[], maxWords: number): Word[][] => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= maxWords || /[.!?,;:]$/.test(w.text)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
};

/** TikTok-style word-by-word captions: one short page at a time, the spoken word highlighted and popped. */
export const Captions: React.FC<{ words: Word[]; theme: Theme; y?: number; maxWords?: number; uppercase?: boolean; offset?: number }> = ({
  words,
  theme,
  y = 0.64,
  maxWords = 3,
  uppercase = false,
  offset = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps - offset;
  const all = pages(words, maxWords);
  const idx = all.findIndex((p, i) => t >= p[0]!.start && t < (all[i + 1]?.[0]!.start ?? p[p.length - 1]!.end + 0.3));
  if (idx < 0) return null;
  const page = all[idx]!;
  const pageStart = page[0]!.start;
  const enter = spring({ frame: frame - (pageStart + offset) * fps, fps, config: { damping: 14, stiffness: 220 } });
  const size = Math.round(width * 0.078);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: height * y,
          left: width * SAFE.left,
          right: width * SAFE.right,
          transform: `translateY(-50%) scale(${0.85 + 0.15 * enter})`,
          textAlign: "center",
          fontFamily,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.12,
          letterSpacing: -0.5,
          color: theme.text,
          WebkitTextStroke: `${Math.round(size / 9)}px #000`,
          paintOrder: "stroke fill",
          textShadow: "0 6px 18px rgba(0,0,0,0.45)",
        }}
      >
        {page.map((w, i) => {
          const active = t >= w.start && t < (page[i + 1]?.start ?? w.end + 0.3);
          const label = uppercase ? w.text.toUpperCase() : w.text;
          return (
            <span key={i} style={{ color: active ? theme.accent : theme.text, display: "inline-block", transform: active ? "scale(1.08)" : "none", margin: `0 ${size * 0.12}px` }}>
              {label}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
