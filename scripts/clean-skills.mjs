#!/usr/bin/env node
/**
 * Remove local build artifacts from skill directories before `ant apply` uploads them
 * (ant uploads every file inside a skill directory). Only these fixed, generated paths are touched.
 */
import { existsSync, rmSync } from "node:fs";

const GENERATED = [
  ".claude/skills/motion-graphics/remotion/node_modules",
  ".claude/skills/motion-graphics/remotion/out",
  ".claude/skills/motion-graphics/remotion/public/demo",
  ".claude/skills/static-ad-design/out",
];

for (const p of GENERATED) {
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log(`removed ${p}`);
  }
}
