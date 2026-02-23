import type { Candidate } from "./types";
import type { MarketCategory } from "./categories";

/** LLM融合生成に必要な最小フィールド */
export interface FusionPairItem {
  id: string;
  title_en: string;
  title_ja: string;
  desc_ja: string;
  marketCategory: MarketCategory | string;
}

export interface FusionPair {
  a: FusionPairItem;
  b: FusionPairItem;
}

/**
 * PASS上位候補から異カテゴリペアを抽出（最大8ペア）
 * 同カテゴリの組み合わせは除外し、多様性を最大化する
 */
export function selectFusionPairs(candidates: Candidate[], maxPairs = 8): FusionPair[] {
  const passed = candidates
    .filter((c) => c.gate.result !== "fail" && c.totalScore > 0)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 10);

  if (passed.length < 2) return [];

  const pairs: FusionPair[] = [];
  for (let i = 0; i < passed.length; i++) {
    for (let j = i + 1; j < passed.length; j++) {
      const a = passed[i];
      const b = passed[j];
      // 異カテゴリのペアのみ
      if (a.marketCategory !== b.marketCategory) {
        pairs.push({ a, b });
      }
      if (pairs.length >= maxPairs) return pairs;
    }
  }
  return pairs;
}
