import { Candidate } from "./types";

/**
 * totalScore で降順ソートし、gate.result="pass" の上位3件を返す
 */
export function pickTop3(candidates: Candidate[]): Candidate[] {
  return candidates
    .filter((c) => c.gate.result === "pass" && c.scores !== null)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 3);
}
