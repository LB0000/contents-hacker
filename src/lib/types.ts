/** ソースから取得した生データを正規化した共通型 */
export interface NormalizedItem {
  id: string;
  source: "producthunt" | "hackernews" | "github" | "reddit";
  title_en: string;
  desc_en: string;
  url: string;
  tags: string[];
  publishedAt: string;
  sourceScore: number | null;
}

export type SourceType = NormalizedItem["source"];

/** 関門判定 */
export interface GateResult {
  pass: boolean;
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
  scores: Scores | null; // gate.pass = false なら null
  totalScore: number;
  jpCompetitors: string[]; // 日本の既知競合サービス名
  deepDived: boolean; // トリアージ深掘り済みか
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
