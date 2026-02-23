import { z } from "zod";
import { MARKET_CATEGORIES } from "../categories";

/** LLM 1回目: 翻訳 + 関門 + 採点 + 競合チェック の1件分 */
export const EvalItemSchema = z.object({
  index: z.number(),
  title_ja: z.string(),
  desc_ja: z.string(),
  gate: z.object({
    result: z.enum(["pass", "maybe", "fail"]),
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
  marketCategory: z.enum(MARKET_CATEGORIES).catch("other").optional().default("other"),
}).refine(
  (data) => data.gate.result === "fail" || data.scores !== null,
  { message: "scores must not be null when gate.result is pass or maybe" }
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

/** ペアワイズ比較: 1件分 */
export const PairwiseItemSchema = z.object({
  id: z.string(),
  relativeRank: z.number().min(1),
  reasoning: z.string(),
});

/** 市場シミュレーション */
const KpiScenarioSchema = z.object({
  mau: z.number(),
  mrr: z.number(),
  cvr: z.number(),
});

export const MarketSimulationSchema = z.object({
  candidateId: z.string(),
  tam: z.string(),
  sam: z.string(),
  som: z.string(),
  scenarios: z.object({
    optimistic: KpiScenarioSchema,
    base: KpiScenarioSchema,
    pessimistic: KpiScenarioSchema,
  }),
  riskFactors: z.array(z.string()).min(1).max(5),
  referenceCases: z.array(z.string()).max(3),
  reasoning: z.string(),
});

/** プロダクト融合アイデア */
export const FusionIdeaSchema = z.object({
  candidateA_id: z.string(),
  candidateB_id: z.string(),
  fusionName: z.string(),
  concept: z.string(),
  jpTarget: z.string(),
  feasibility: z.number().min(1).max(5),
  novelty: z.number().min(1).max(5),
  reasoning: z.string(),
});

/** ローンチパッド: デザイン仕様 */
export const LaunchPadDesignSchema = z.object({
  primaryColor: z.string(),
  fontFamily: z.string(),
  heroHeadline: z.string(),
  heroSubline: z.string(),
  features: z.array(z.string()).min(2).max(6),
  ctaText: z.string(),
});

/** ローンチパッド: スキャフォールドファイル */
export const ScaffoldFileSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export type EvalItem = z.infer<typeof EvalItemSchema>;
export type MvpPlanItem = z.infer<typeof MvpPlanSchema>;
export type PairwiseItem = z.infer<typeof PairwiseItemSchema>;
export type MarketSimulationItem = z.infer<typeof MarketSimulationSchema>;
export type FusionIdeaItem = z.infer<typeof FusionIdeaSchema>;
export type LaunchPadDesignItem = z.infer<typeof LaunchPadDesignSchema>;
export type ScaffoldFileItem = z.infer<typeof ScaffoldFileSchema>;
