import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseAgent, toClaudeCode } from "./sync-claude-code-agents.mjs";

test("every agent file parses and has name, description, a current model and a body", () => {
  for (const f of readdirSync("agents").filter((x) => x.endsWith(".md"))) {
    const a = parseAgent(readFileSync(`agents/${f}`, "utf8"));
    assert.equal(`${a.name}.md`, f, `name matches filename for ${f}`);
    assert.ok(a.description && a.description.length > 40, `${f} description`);
    assert.match(a.modelId, /^claude-(opus|sonnet|haiku)-5-5$/, `${f} model`);
    assert.ok(a.body.length > 400, `${f} body`);
    assert.match(toClaudeCode(a), /^---\nname: /);
  }
});

test("every skill referenced by an agent exists", () => {
  for (const f of readdirSync("agents").filter((x) => x.endsWith(".md"))) {
    const text = readFileSync(`agents/${f}`, "utf8");
    for (const m of text.matchAll(/\.\.\/\.claude\/skills\/([\w-]+)/g)) {
      const skill = readFileSync(`.claude/skills/${m[1]}/SKILL.md`, "utf8");
      assert.match(skill, /^---\nname: /, `${m[1]} SKILL.md frontmatter`);
    }
  }
});

test("every roster member referenced by a coordinator exists and has no roster of its own", () => {
  for (const f of readdirSync("agents").filter((x) => x.endsWith(".md"))) {
    const text = readFileSync(`agents/${f}`, "utf8");
    for (const m of text.matchAll(/- \.\/([\w-]+)\.md/g)) {
      const member = readFileSync(`agents/${m[1]}.md`, "utf8");
      assert.doesNotMatch(member, /^multiagent:/m, `${m[1]} is rostered by ${f} so it must not have multiagent`);
    }
  }
});
