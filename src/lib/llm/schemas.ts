import { z } from "zod";

/** LLM 1回目: 翻訳 + 関門 + 採点 + 競合チェック の1件分 */
export const EvalItemSchema = z.object({
  index: z.number(),
  title_ja: z.string(),
  desc_ja: z.string(),
  gate: z.object({
    pass: z.boolean(),
    reason_ja: z.string(),
  }),
  scores: z
    .object({
      traceSpeed: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]).default("medium") }),
      jpDemand: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]).default("medium") }),
      jpGap: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]).default("medium") }),
      riskLow: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]).default("medium") }),
    })
    .nullable(),
  jpCompetitors: z.array(z.string()).optional().default([]),
}).refine(
  (data) => !data.gate.pass || data.scores !== null,
  { message: "scores must not be null when gate.pass is true" }
);

/** LLM 2回目: トレース計画 の1件分 */
export const MvpPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  originalUrl: z.string(),
  jpTarget: z.string(),
  localization: z.string(),
  techApproach: z.string(),
  launchPlan: z.string(),
  monetization: z.string(),
});

export const MvpPlansResponseSchema = z.array(MvpPlanSchema);

export type EvalItem = z.infer<typeof EvalItemSchema>;
export type MvpPlanItem = z.infer<typeof MvpPlanSchema>;
