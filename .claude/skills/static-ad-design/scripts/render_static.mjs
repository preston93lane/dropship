#!/usr/bin/env node
/**
 * Render a static ad from an HTML template + JSON props to PNG at one or more sizes, with layout QA.
 *
 *   node render_static.mjs --template hero-benefits --props props.json --sizes 1080x1350,1080x1920 --out out/ --name cable-hero
 *
 * Props binding (see templates/*.html):
 *   data-text="key"   -> textContent (escaped)
 *   data-html="key"   -> text where *word* becomes a highlighted span (no raw HTML accepted)
 *   data-src="key"    -> image; local paths are inlined as data URIs, URLs pass through
 *   data-stars="key"  -> number 1-5 rendered as stars
 *   data-if="key"     -> element removed unless the prop is truthy
 * Elements whose prop is missing are removed, so optional parts (badge, compareAt) just disappear.
 * props.theme = {accent, accentText, bg, text} overrides the CSS variables.
 *
 * Prints JSON: {files: [...], qa: [{size, warnings: [...]}]}. Exit 1 if text overflows the frame.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("playwright not found. It is preinstalled in cloud sandboxes; locally: npm i -g playwright");
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(HERE, "../templates");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
if (!args.template || !args.props) {
  console.error("usage: render_static.mjs --template <name> --props <file.json> [--sizes 1080x1350,1080x1920] [--out dir] [--name slug]");
  process.exit(2);
}

const propsPath = resolve(args.props);
const props = JSON.parse(readFileSync(propsPath, "utf8"));
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
for (const [k, v] of Object.entries(props)) {
  if (typeof v === "string" && MIME[extname(v).toLowerCase()] && !/^https?:|^data:/.test(v)) {
    const p = resolve(dirname(propsPath), v);
    if (!existsSync(p)) throw new Error(`image not found for ${k}: ${p}`);
    props[k] = `data:${MIME[extname(v).toLowerCase()]};base64,${readFileSync(p).toString("base64")}`;
  }
}

const tplFile = join(TEMPLATES, `${args.template}.html`);
if (!existsSync(tplFile)) throw new Error(`no template ${args.template}`);
const css = readFileSync(join(TEMPLATES, "base.css"), "utf8");

const binder = `
<script>
(() => {
  const P = window.PROPS || {};
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t = P.theme || {};
  const root = document.documentElement.style;
  if (t.accent) root.setProperty('--accent', t.accent);
  if (t.accentText) root.setProperty('--accent-text', t.accentText);
  if (t.bg) root.setProperty('--bg', t.bg);
  if (t.text) root.setProperty('--text', t.text);
  const missing = v => v === undefined || v === null || v === '' || v === false;
  document.querySelectorAll('[data-text]').forEach(el => { const v = P[el.dataset.text]; if (missing(v)) el.remove(); else el.textContent = v; });
  document.querySelectorAll('[data-html]').forEach(el => { const v = P[el.dataset.html]; if (missing(v)) el.remove(); else el.innerHTML = esc(v).replace(/\\*(.+?)\\*/g, '<span class="hl">$1</span>').replace(/\\n/g, '<br>'); });
  document.querySelectorAll('[data-src]').forEach(el => { const v = P[el.dataset.src]; if (missing(v)) el.remove(); else el.src = v; });
  document.querySelectorAll('[data-stars]').forEach(el => { const n = Math.max(0, Math.min(5, Math.round(Number(P[el.dataset.stars] || 0)))); if (!n) el.remove(); else el.textContent = '★'.repeat(n); });
  document.querySelectorAll('[data-if]').forEach(el => { if (missing(P[el.dataset.if])) el.remove(); });
})();
</script>`;

let html = readFileSync(tplFile, "utf8")
  .replace('<link rel="stylesheet" href="base.css">', `<style>${css}</style>`)
  .replace("<head>", `<head><script>window.PROPS = ${JSON.stringify(props).replace(/</g, "\\u003c")};</script>`);
html = html.replace(/<\/body>/, `${binder}</body>`);

const sizes = (args.sizes ?? "1080x1350,1080x1920").split(",").map((s) => s.split("x").map(Number));
const outDir = resolve(args.out ?? "out");
mkdirSync(outDir, { recursive: true });
const name = args.name ?? args.template;

const browser = await chromium.launch();
const files = [];
const qa = [];
let overflow = false;
for (const [w, h] of sizes) {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: w, height: h } }); // fresh page: no state leaks between sizes
  await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 }).catch(() => page.setContent(html, { waitUntil: "load" }));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  const warnings = await page.evaluate(({ w, h }) => {
    const out = [];
    const safeBottom = h * 0.8;
    for (const el of document.querySelectorAll(".headline,.subhead,.chip,.cta,.quote,.line,.price,.label,td,th")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const name = (el.className || el.tagName).toString().split(" ")[0];
      if (r.right > w + 1 || r.bottom > h + 1 || r.left < -1 || r.top < -1) out.push(`OVERFLOW ${name}: text leaves the frame`);
      if (fs < 30 * (w / 1080)) out.push(`small text in ${name}: ${Math.round(fs)}px (min ~30px at 1080w)`);
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible") out.push(`clipped text in ${name}`);
      if (h / w >= 1.7 && r.top > safeBottom && !el.classList.contains("cta")) out.push(`${name} sits in the bottom 20% (covered by TikTok/Reels UI on 9:16)`);
    }
    return out;
  }, { w, h });
  if (warnings.some((x) => x.startsWith("OVERFLOW"))) overflow = true;
  const file = join(outDir, `${name}_${w}x${h}.png`);
  await page.screenshot({ path: file, type: "png" });
  files.push(file);
  qa.push({ size: `${w}x${h}`, warnings });
  await page.close();
}
await browser.close();
console.log(JSON.stringify({ files, qa }, null, 2));
process.exit(overflow ? 1 : 0);
