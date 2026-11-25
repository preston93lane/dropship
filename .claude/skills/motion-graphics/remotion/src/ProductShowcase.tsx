import React from "react";
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EndCard, type EndCardProps } from "./components/EndCard";
import { asset, defaultTheme, fontFamily, type Theme } from "./theme";

export type ProductShowcaseProps = {
  width: number;
  height: number;
  fps: number;
  product: string; // transparent cutout PNG of the REAL product
  title: string; // opening line, e.g. "The 10-second desk fix"
  features: { text: string; side?: "left" | "right" }[]; // 3-4 short, true features
  endCard: EndCardProps & { duration: number };
  music?: { src: string; volume?: number };
  secondsPerFeature?: number;
  theme?: Partial<Theme>;
};

export const showcaseDuration = (p: ProductShowcaseProps) => Math.ceil((1.8 + p.features.length * (p.secondsPerFeature ?? 1.6) + p.endCard.duration) * p.fps);

/** Pure motion-graphics product ad from a single cutout: great when only supplier photos exist. */
export const ProductShowcase: React.FC<ProductShowcaseProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const theme = { ...defaultTheme, ...(p.theme ?? {}) };
  const per = (p.secondsPerFeature ?? 1.6) * fps;
  const intro = 1.8 * fps;
  const endFrames = Math.round(p.endCard.duration * fps);
  const body = durationInFrames - endFrames;
  const float = Math.sin((frame / fps) * Math.PI * 0.8) * height * 0.008;
  const spin = interpolate(frame, [0, body], [-4, 4]);
  const enter = spring({ frame, fps, config: { damping: 13 } });
  const u = width / 100;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, #33405a 0%, ${theme.background} 72%)`, fontFamily, color: theme.text }}>
      {p.music ? <Audio src={asset(p.music.src)} volume={p.music.volume ?? 0.3} loop /> : null}
      <Sequence durationInFrames={body}>
        <AbsoluteFill style={{ alignItems: "center" }}>
          <div style={{ position: "absolute", top: height * 0.1, left: u * 7, right: u * 16, textAlign: "center", fontWeight: 900, fontSize: u * 8, lineHeight: 1.05, letterSpacing: -1, transform: "translateZ(0)", opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" }) }}>
            {p.title}
          </div>
          <Img
            src={asset(p.product)}
            style={{ position: "absolute", top: height * 0.2, width: width * 0.7, height: height * 0.34, objectFit: "contain", transform: `translateY(${float}px) rotate(${spin}deg) scale(${0.8 + 0.2 * enter})`, filter: "drop-shadow(0 40px 50px rgba(0,0,0,0.55))" }}
          />
          {p.features.map((f, i) => {
            // stacked under the product, inside the safe zone (max 4 features)
            const start = intro + i * per;
            const s = spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 190 } });
            const fromLeft = (f.side ?? (i % 2 === 0 ? "left" : "right")) === "left";
            return (
              <div key={i} style={{ position: "absolute", top: height * (0.58 + i * 0.065), left: u * 6, right: u * 16, display: "flex", justifyContent: "center" }}>
                <div
                  style={{
                    transform: `translateX(${interpolate(s, [0, 1], [fromLeft ? -u * 60 : u * 60, 0])}px)`,
                    opacity: s,
                    background: theme.accent,
                    color: theme.accentText,
                    fontWeight: 800,
                    fontSize: u * 5,
                    padding: `${u * 1.8}px ${u * 3.4}px`,
                    borderRadius: 999,
                    boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
                  }}
                >
                  ✓ {f.text}
                </div>
              </div>
            );
          })}
        </AbsoluteFill>
      </Sequence>
      <Sequence from={body}>
        <EndCard {...p.endCard} theme={theme} />
      </Sequence>
    </AbsoluteFill>
  );
};
