import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { asset, fontFamily, type Theme } from "../theme";

export type EndCardProps = {
  headline: string; // e.g. "Tidy desk in 10 seconds"
  cta: string; // e.g. "Shop now"
  image?: string; // product cutout (transparent PNG works best)
  price?: string; // "$29.99"
  compareAt?: string; // only when a real reference price exists
  badge?: string; // "Free US shipping" (must be true)
};

export const EndCard: React.FC<EndCardProps & { theme: Theme }> = ({ headline, cta, image, price, compareAt, badge, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14 } });
  const pulse = 1 + 0.04 * Math.sin((frame / fps) * Math.PI * 2.2);
  const u = width / 100;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 38%, #2a2f3a 0%, ${theme.background} 70%)`, fontFamily, color: theme.text, alignItems: "center" }}>
      {image ? (
        <Img src={asset(image)} style={{ position: "absolute", top: height * 0.12, width: width * 0.66, height: height * 0.36, objectFit: "contain", transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px) scale(${0.9 + 0.1 * enter})`, filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.5))" }} />
      ) : null}
      <div style={{ position: "absolute", top: height * 0.52, left: u * 8, right: u * 8, textAlign: "center", opacity: enter, transform: "translateZ(0)", willChange: "transform, opacity" }}>
        <div style={{ fontSize: u * 8.2, fontWeight: 900, lineHeight: 1.05, letterSpacing: -1 }}>{headline}</div>
        {price ? (
          <div style={{ marginTop: u * 4, fontSize: u * 9, fontWeight: 900 }}>
            {compareAt ? <span style={{ fontSize: u * 5.5, opacity: 0.55, textDecoration: "line-through", marginRight: u * 3 }}>{compareAt}</span> : null}
            {price}
          </div>
        ) : null}
        {badge ? <div style={{ marginTop: u * 2.5, fontSize: u * 4.2, fontWeight: 600, opacity: 0.85 }}>{badge}</div> : null}
        <div style={{ display: "inline-block", marginTop: u * 5, background: theme.accent, color: theme.accentText, fontWeight: 900, fontSize: u * 6, padding: `${u * 2.6}px ${u * 9}px`, borderRadius: 999, transform: `scale(${pulse})` }}>
          {cta}
        </div>
      </div>
    </AbsoluteFill>
  );
};
