import { loadFont } from "@remotion/google-fonts/Inter";
import { staticFile } from "remotion";

export const { fontFamily } = loadFont("normal", { weights: ["600", "800", "900"], subsets: ["latin"] });

export type Theme = {
  accent: string; // highlight color for active caption word, callouts, CTA
  accentText: string; // text color on accent backgrounds
  background: string; // end card / showcase background
  text: string;
};

export const defaultTheme: Theme = { accent: "#FFE14D", accentText: "#111111", background: "#0F1115", text: "#FFFFFF" };

/** Local asset names resolve from public/; http(s) URLs pass through. */
export const asset = (src: string): string => (/^https?:\/\//.test(src) ? src : staticFile(src));

/** Caption/text positions are fractions of frame height; keep clear of platform UI (bottom ~20%, right ~15%). */
export const SAFE = { left: 0.06, right: 0.16, top: 0.1, bottom: 0.22 };
