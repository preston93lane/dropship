import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily, SAFE } from "../theme";

/** Pattern-interrupt hook: a bold white card that pops in with a slight tilt. Use for the first 1.5-2.5s. */
export const HookText: React.FC<{ text: string; y?: number; durationInFrames: number }> = ({ text, y = 0.2, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 180, mass: 0.7 } });
  const out = interpolate(frame, [durationInFrames - 6, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const size = Math.round(width * 0.076);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: height * y,
          left: width * SAFE.left,
          right: width * SAFE.right,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(-50%) scale(${pop}) rotate(${interpolate(pop, [0, 1], [-6, -1.5])}deg)`,
          opacity: out,
        }}
      >
        <div
          style={{
            background: "#FFFFFF",
            color: "#111111",
            fontFamily,
            fontWeight: 900,
            fontSize: size,
            lineHeight: 1.08,
            letterSpacing: -1,
            padding: `${size * 0.32}px ${size * 0.5}px`,
            borderRadius: size * 0.28,
            textAlign: "center",
            boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
            maxWidth: "100%",
          }}
        >
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
