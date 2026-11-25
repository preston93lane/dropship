// Deno-only: the independent compliance judge (see ../app/compliance.ts for the contract and prompt).
// One structured-output call per creative the agent passed: ~$0.05-0.15 each on Claude Opus 5.5.
// Server-side refusal fallbacks are on; a refusal is treated as "revise" so a human looks at it.
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@1.8.0/helpers/beta/zod";
import { z } from "npm:zod@4.6.7";
import { buildJudgeText, JUDGE_SYSTEM_PROMPT, type ComplianceJudge, type JudgeInput, type JudgeResult } from "../app/compliance.ts";

const VerdictSchema = z.object({
  verdict: z.enum(["pass", "revise", "fail"]),
  issues: z.array(
    z.object({
      severity: z.enum(["high", "medium", "low"]),
      section: z.string(),
      problem: z.string(),
      fix: z.string(),
    }),
  ),
  ai_disclosure_required: z.boolean(),
});

const MODEL = "claude-opus-5-5";

export function createComplianceJudge(apiKey: string): ComplianceJudge {
  const client = new Anthropic({ apiKey });
  return {
    async review(input: JudgeInput): Promise<JudgeResult> {
      const images = input.frames.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } }));
      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "high", format: betaZodOutputFormat(VerdictSchema) },
        system: JUDGE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: [...images, { type: "text", text: buildJudgeText(input) }] }],
      });
      if (response.stop_reason === "refusal") {
        return {
          verdict: "revise",
          issues: [{ severity: "high", section: "review", problem: "The independent judge declined to review this ad.", fix: "A human should review it in the console." }],
          ai_disclosure_required: false,
          model: response.model,
        };
      }
      const parsed = response.parsed_output;
      if (!parsed) throw new Error(`judge returned no parseable verdict (stop_reason ${response.stop_reason})`);
      return { ...parsed, model: response.model };
    },
  };
}
