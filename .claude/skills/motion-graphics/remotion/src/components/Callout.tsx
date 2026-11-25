import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily, SAFE, type Theme } from "../theme";

/** Feature callout pill that slides in from the left. Keep to 2-4 words ("Holds 6 cables"). */
export const Callout: React.FC<{ text: string; y?: number; icon?: string; theme: Theme; durationInFrames: number }> = ({ text, y = 0.3, icon = "✓", theme, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15, stiffness: 200 } });
  const exit = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = Math.round(width * 0.054);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: height * y,
          left: width * SAFE.left,
          transform: `translateX(${interpolate(enter, [0, 1], [-width * 0.6, 0])}px) translateY(-50%)`,
          opacity: exit,
          display: "flex",
          alignItems: "center",
          gap: size * 0.4,
          background: theme.accent,
          color: theme.accentText,
          fontFamily,
          fontWeight: 800,
          fontSize: size,
          padding: `${size * 0.35}px ${size * 0.6}px`,
          borderRadius: 999,
          boxShadow: "0 10px 28px rgba(0,0,0,0.3)",
        }}
      >
        <span style={{ fontWeight: 900 }}>{icon}</span>
        <span>{text}</span>
      </div>
    </AbsoluteFill>
  );
};
