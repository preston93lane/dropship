---
name: prompt-evolution
description: Safely improve the agents themselves - diagnose which instruction caused a recurring failure, write the minimal edit to a skill or agent prompt, back-test it on the eval set, and submit it as a human-reviewed proposal with evidence. Never weakens guardrails or compliance. Use in the IMPROVE loop when a failure pattern repeats.
---

# Prompt evolution

The system improves its own instructions, but every change is **proposed, tested and human-approved**, never applied directly. Agents run from versioned files (`agents/*.md`, `.claude/skills/*/SKILL.md`). A merged change ships with the next `ant apply`.

## When to propose

A failure pattern repeats (≥ 3 occurrences) and traces to an instruction: compliance keeps rejecting the same claim type → the copywriting skill needs a sharper rule; research validates products that die at the same funnel stage → the rubric anchor or a hard gate is off; producers overspend → budget guidance is unclear. One-off failures are noise; log them, don't legislate.

## How

1. **Diagnose**: quote the instruction (file and line) and the failing outputs (ids). Explain the causal link.
2. **Minimal edit**: change the fewest words that fix it. Prefer clarifying a rule or adding a concrete example over adding a new rule. Remove instructions that newer evidence contradicts.
3. **Back-test** where an eval exists (`evals/`): run the affected agent or skill on the eval cases before and after (e.g. compliance cases, product-scoring backtests). Report pass rates. No eval? Propose one alongside the change.
4. **Submit**: `gw POST /v1/proposals` with
   ```json
   {"kind": "skill_edit", "title": "ad-copywriting: ban 'never tangles' style absolutes",
    "rationale": "3 compliance rejections in 2 weeks for absolute durability claims (creatives …)",
    "evidence": {"failures": ["…"], "eval": {"before": "7/10", "after": "10/10"}},
    "files": [{"path": ".claude/skills/ad-copywriting/SKILL.md", "content": "<FULL new file content>"}]}
   ```
   The human reviews it in the console; approved proposals are pulled into git with `npm run proposals:pull`, reviewed as a diff, merged and applied.

## Never propose

Weakening guardrails, spend caps, autonomy rules, the compliance checklist or claims rules to improve a metric. Removing human approval steps. Giving agents new credentials or network access. Changes that make agents less honest about uncertainty or results. If you believe a guardrail is wrong, write a `config` proposal explaining the evidence and let the human decide.
