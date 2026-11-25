import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(90);
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
// Cloud sandboxes ship Chromium at this path (Playwright). Override with --browser-executable if needed.
Config.setBrowserExecutable(process.env.REMOTION_BROWSER ?? "/opt/pw-browsers/chromium");
// With the full Chromium build (not chrome-headless-shell), parallel tabs occasionally screenshot a frame
// before all text layers are painted (verified: dropped end-card text at concurrency 4, none at 1).
// Default to 1; raise REMOTION_CONCURRENCY only with chrome-headless-shell (`npx remotion browser ensure`).
Config.setConcurrency(Number(process.env.REMOTION_CONCURRENCY ?? 1));
