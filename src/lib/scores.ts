import type { Candidate } from "./types";
import { WEIGHTS_KEY } from "./constants";
import type { SortKey } from "./constants";

export interface ScoreWeights {
  traceSpeed: number;
  jpDemand: number;
  jpGap: number;
  riskLow: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = { traceSpeed: 1, jpDemand: 1, jpGap: 1, riskLow: 1 };

export function loadWeights(): ScoreWeights {
  if (typeof window === "undefined") return DEFAULT_WEIGHTS;
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY);
    return raw ? { ...DEFAULT_WEIGHTS, ...JSON.parse(raw) } : DEFAULT_WEIGHTS;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export function calcWeightedTotal(c: Candidate, w: ScoreWeights): number {
  if (!c.scores) return 0;
  const demand = c.scores.jpDemand.score * w.jpDemand;
  const gap = c.scores.jpGap.score * w.jpGap;
  if (demand === 0 || gap === 0) return 0;
  return demand * gap + c.scores.traceSpeed.score * w.traceSpeed + c.scores.riskLow.score * w.riskLow;
}

export function getScoreValue(c: Candidate, key: SortKey, weights: ScoreWeights): number {
  if (key === "totalScore") return calcWeightedTotal(c, weights);
  if (key === "sourceScore") return c.sourceScore ?? -1;
  if (!c.scores) return -1;
  return c.scores[key].score;
}

export function scoreColor(score: number): string {
  if (score >= 4) return "text-score-high";
  if (score >= 2) return "text-score-mid";
  return "text-score-low";
}

export function scoreBgColor(score: number): string {
  if (score >= 4) return "bg-score-high";
  if (score >= 2) return "bg-score-mid";
  return "bg-score-low";
}
