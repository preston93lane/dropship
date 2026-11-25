import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("compliance eval cases are well-formed", () => {
  const lines = readFileSync("evals/compliance/cases.jsonl", "utf8").trim().split("\n");
  const ids = new Set();
  for (const line of lines) {
    const c = JSON.parse(line);
    assert.ok(c.id && !ids.has(c.id), `unique id ${c.id}`);
    ids.add(c.id);
    assert.ok(["pass", "revise", "fail"].includes(c.expected.verdict), c.id);
    assert.ok(Array.isArray(c.expected.must_flag), c.id);
    assert.ok(c.input.product_facts, c.id);
  }
  assert.ok(lines.length >= 10);
});
