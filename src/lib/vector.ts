import type { CaseEntry, SimilarCase } from "./types";

/** 高類似度の閾値（これ以上ならboost/warningシグナル発生） */
const HIGH_SIMILARITY_THRESHOLD = 0.6;

/** 最低類似度（これ未満はフィルタ） */
const DEFAULT_MIN_SIMILARITY = 0.3;

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/** Determine signal from case outcome and similarity */
export function determineSignal(caseEntry: CaseEntry, similarity: number): SimilarCase["signal"] {
  if (similarity < HIGH_SIMILARITY_THRESHOLD) return "neutral";
  if (caseEntry.outcome === "success") return "boost";
  if (caseEntry.outcome === "failure") return "warning";
  return "neutral";
}

/** Find top K similar cases for a candidate embedding */
export function findSimilarCases(
  candidateEmbedding: number[],
  cases: CaseEntry[],
  topK = 3,
  minSimilarity = DEFAULT_MIN_SIMILARITY,
): SimilarCase[] {
  return cases
    .filter((c) => c.embedding.length > 0)
    .map((c) => {
      const similarity = cosineSimilarity(candidateEmbedding, c.embedding);
      return {
        caseEntry: c,
        similarity,
        signal: determineSignal(c, similarity),
      };
    })
    .filter((s) => s.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
