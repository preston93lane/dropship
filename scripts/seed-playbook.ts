/**
 * Seed the Managed Agents `playbook` memory store from ./playbook/*.md (run once after the first `ant apply`).
 * Existing memories are left untouched (the self-improver owns them after seeding).
 *
 *   ANTHROPIC_API_KEY=... node --experimental-strip-types scripts/seed-playbook.ts
 */
import Anthropic from "@anthropic-ai/sdk";
import { readdirSync, readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync("claude-lock.json", "utf8")) as { resources: Record<string, { id: string }> };
const store = Object.entries(lock.resources).find(([path]) => path.includes("memory_stores/playbook"))?.[1]?.id;
if (!store) throw new Error("playbook memory store not found in claude-lock.json; run `ant apply` first");

const client = new Anthropic();
for (const file of readdirSync("playbook").filter((f) => f.endsWith(".md") && f !== "README.md")) {
  const content = readFileSync(`playbook/${file}`, "utf8");
  try {
    await client.beta.memoryStores.memories.create(store, { path: `/${file}`, content });
    console.log(`seeded /${file}`);
  } catch (e) {
    if (e instanceof Anthropic.ConflictError) console.log(`exists, skipped /${file}`);
    else throw e;
  }
}
