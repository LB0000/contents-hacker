import type { MarketCategory } from "./categories";

/** ソースから取得した生データを正規化した共通型 */
export interface NormalizedItem {
  id: string;
  source: "producthunt" | "hackernews" | "github" | "reddit" | "indiehackers" | "betalist";
  title_en: string;
  desc_en: string;
  url: string;
  tags: string[];
  publishedAt: string;
  sourceScore: number | null;
  marketCategory: MarketCategory;
  overseasPopularity?: number; // 0-1 正規化済みソーススコア
}

export type SourceType = NormalizedItem["source"];

/** 関門判定（3段階） */
export type GateLevel = "pass" | "maybe" | "fail";
export interface GateResult {
  result: GateLevel;
  reason_ja: string;
}

/** 個別スコア */
export interface ScoreEntry {
  score: number; // 0-5
  reason_ja: string;
  confidence: "high" | "medium" | "low";
}

/** 4軸採点（日本トレース特化） */
export interface Scores {
  traceSpeed: ScoreEntry;     // トレース速度: バイブコーディングで何日で作れるか
  jpDemand: ScoreEntry;       // 日本需要: 日本市場に同等の課題・需要があるか
  jpGap: ScoreEntry;          // 日本空白度: 日本に競合がいないか
  riskLow: ScoreEntry;        // リスク低: 法規制・API依存・技術リスクが低いか
}

/** 判定・採点済みの候補 */
export interface Candidate {
  id: string;
  source: SourceType;
  title_en: string;
  desc_en: string;
  title_ja: string;
  desc_ja: string;
  url: string;
  tags: string[];
  publishedAt: string;
  sourceScore: number | null;
  gate: GateResult;
  scores: Scores | null; // gate.result = "fail" なら null
  totalScore: number;
  jpCompetitors: string[]; // 日本の既知競合サービス名
  deepDived: boolean; // トリアージ深掘り済みか
  marketCategory: MarketCategory;
  overseasPopularity: number; // 0-1 海外注目度
}

/** 上位3件のトレース計画 */
export interface MvpPlan {
  id: string;
  title: string;
  originalUrl: string;
  jpTarget: string;
  localization: string;
  techApproach: string;
  launchPlan: string;
  monetization: string;
}

/** API全体のレスポンス */
export interface RunResult {
  candidates: Candidate[];
  topPlans: MvpPlan[];
  errors: string[];
}

// ── Phase 1: 継続学習ループ ──

/** ユーザーのフィードバックステータス */
export type FeedbackStatus = "considering" | "started" | "skipped" | "succeeded" | "failed";

/** フィードバック1件分 */
export interface FeedbackEntry {
  candidateId: string;
  title_en: string;
  title_ja: string;
  marketCategory: MarketCategory;
  predictedScores: {
    jpDemand: number;
    jpGap: number;
    traceSpeed: number;
    riskLow: number;
    totalScore: number;
  };
  status: FeedbackStatus;
  reason?: string;
  timestamp: string;
}

// ── Phase 2: 市場シミュレーション ──

export interface KpiScenario {
  mau: number;
  mrr: number;
  cvr: number;
}

export interface MarketSimulation {
  candidateId: string;
  tam: string;
  sam: string;
  som: string;
  scenarios: {
    optimistic: KpiScenario;
    base: KpiScenario;
    pessimistic: KpiScenario;
  };
  timeframe: "6months";
  riskFactors: string[];
  referenceCases: string[];
  reasoning: string;
}

// ── Phase 3: ビジュアルマップUI ──

export type MapAxis = "jpDemand" | "jpGap" | "traceSpeed" | "riskLow" | "overseasPopularity" | "totalScore";

export type MapColorBy = "gate" | "category" | "source";

// ── Phase 4: ベクトル検索 ──

export interface CaseEntry {
  id: string;
  originalProduct: string;
  jpTraceProduct: string;
  category: MarketCategory;
  outcome: "success" | "failure" | "ongoing";
  summary: string;
  embedding: number[];
  yearLaunched: number;
  lessonsLearned: string;
}

export interface SimilarCase {
  caseEntry: CaseEntry;
  similarity: number;
  signal: "boost" | "warning" | "neutral";
}

// ── Phase 5: プロダクト融合 ──

export interface FusionIdea {
  candidateA: { id: string; title_ja: string };
  candidateB: { id: string; title_ja: string };
  fusionName: string;
  concept: string;
  jpTarget: string;
  feasibility: number; // 1-5
  novelty: number; // 1-5
  reasoning: string;
}

// ── Phase 6: ローンチパッド ──

export interface LaunchPadSpec {
  planId: string;
  designTokens: {
    primaryColor: string;
    fontFamily: string;
    heroHeadline: string;
    heroSubline: string;
    features: string[];
    ctaText: string;
  };
  lpHtml: string;
  scaffoldFiles: ScaffoldFile[];
}

export interface ScaffoldFile {
  path: string;
  content: string;
}

/** バイアス分析レポート */
export interface BiasReport {
  sampleSize: number;
  reliability: "low" | "medium" | "high";
  axisAccuracy: Record<string, { predicted: number; actual: number; bias: number }>;
  categoryBreakdown: Record<string, { succeeded: number; failed: number; total: number }>;
}
