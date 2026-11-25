import React from "react";
import { Composition } from "remotion";
import { AdVideo, adDurationInFrames, type AdVideoProps } from "./AdVideo";
import { KineticHook, kineticDuration, type KineticHookProps } from "./KineticHook";
import { ProductShowcase, showcaseDuration, type ProductShowcaseProps } from "./ProductShowcase";

const adDefaults: AdVideoProps = {
  width: 1080,
  height: 1920,
  fps: 30,
  clips: [{ src: "demo/hook.mp4", type: "video", duration: 3 }, { src: "demo/product.png", type: "image", duration: 3, motion: "zoom_in" }],
  voiceover: "demo/vo.mp3",
  words: [
    { text: "My", start: 0.1, end: 0.3 },
    { text: "desk", start: 0.3, end: 0.6 },
    { text: "was", start: 0.6, end: 0.8 },
    { text: "chaos.", start: 0.8, end: 1.3 },
  ],
  hook: { text: "My desk was chaos", end: 2.2 },
  callouts: [{ text: "Holds 6 cables", start: 3.2, end: 5.2 }],
  endCard: { headline: "Tidy desk in 10 seconds", cta: "Shop now", price: "$29.99", badge: "Ships from the US", duration: 1.8 },
  progressBar: true,
};

const showcaseDefaults: ProductShowcaseProps = {
  width: 1080,
  height: 1920,
  fps: 30,
  product: "demo/product.png",
  title: "The 10-second desk fix",
  features: [{ text: "Magnetic snap" }, { text: "Holds 6 cables" }, { text: "No tools needed" }],
  endCard: { headline: "Desk glow-up", cta: "Shop now", price: "$29.99", duration: 1.8 },
};

const hookDefaults: KineticHookProps = { width: 1080, height: 1920, fps: 30, lines: ["STOP", "scrolling", "your desk", "is a mess"] };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="AdVideo"
      component={AdVideo}
      defaultProps={adDefaults}
      durationInFrames={adDurationInFrames(adDefaults)}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={({ props }) => ({ durationInFrames: adDurationInFrames(props), fps: props.fps, width: props.width, height: props.height })}
    />
    <Composition
      id="ProductShowcase"
      component={ProductShowcase}
      defaultProps={showcaseDefaults}
      durationInFrames={showcaseDuration(showcaseDefaults)}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={({ props }) => ({ durationInFrames: showcaseDuration(props), fps: props.fps, width: props.width, height: props.height })}
    />
    <Composition
      id="KineticHook"
      component={KineticHook}
      defaultProps={hookDefaults}
      durationInFrames={kineticDuration(hookDefaults)}
      fps={30}
      width={1080}
      height={1920}
      calculateMetadata={({ props }) => ({ durationInFrames: kineticDuration(props), fps: props.fps, width: props.width, height: props.height })}
    />
  </>
);
