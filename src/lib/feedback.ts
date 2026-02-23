import type { Candidate, FeedbackEntry, FeedbackStatus, BiasReport } from "./types";

const FEEDBACK_KEY = "ch-feedback";
const MAX_FEEDBACK = 200;

// ── 永続化 ──

export function loadFeedback(): FeedbackEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFeedback(entry: FeedbackEntry): void {
  if (typeof window === "undefined") return;
  const all = loadFeedback();
  const idx = all.findIndex((e) => e.candidateId === entry.candidateId);
  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.unshift(entry);
  }
  const trimmed = all.slice(0, MAX_FEEDBACK);
  try {
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(trimmed));
  } catch {
    // QuotaExceeded: 古いデータを削除して再試行
    const smaller = trimmed.slice(0, Math.floor(trimmed.length / 2));
    try { localStorage.setItem(FEEDBACK_KEY, JSON.stringify(smaller)); } catch { /* give up */ }
  }
}

export function removeFeedback(candidateId: string): void {
  if (typeof window === "undefined") return;
  const all = loadFeedback().filter((e) => e.candidateId !== candidateId);
  try { localStorage.setItem(FEEDBACK_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

/** Candidate + FeedbackStatus → FeedbackEntry を作成 */
export function createFeedbackEntry(candidate: Candidate, status: FeedbackStatus): FeedbackEntry {
  return {
    candidateId: candidate.id,
    title_en: candidate.title_en,
    title_ja: candidate.title_ja,
    marketCategory: candidate.marketCategory,
    predictedScores: {
      jpDemand: candidate.scores?.jpDemand.score ?? 0,
      jpGap: candidate.scores?.jpGap.score ?? 0,
      traceSpeed: candidate.scores?.traceSpeed.score ?? 0,
      riskLow: candidate.scores?.riskLow.score ?? 0,
      totalScore: candidate.totalScore,
    },
    status,
    timestamp: new Date().toISOString(),
  };
}

// ── Few-shot 例生成 ──

/** フィードバックから評価プロンプト用のFew-shot例文字列を生成 */
export function buildFewShotExamples(feedback: FeedbackEntry[], limit = 5): string {
  // succeeded/failed を優先、次に started
  const prioritized = [...feedback].sort((a, b) => {
    const priority: Record<FeedbackStatus, number> = {
      succeeded: 0, failed: 1, started: 2, considering: 3, skipped: 4,
    };
    return priority[a.status] - priority[b.status];
  });

  const selected = prioritized.slice(0, limit);
  if (selected.length === 0) return "";

  const lines = selected.map((e) => {
    const outcome = e.status === "succeeded" ? "成功" : e.status === "failed" ? "失敗" : e.status === "started" ? "着手中" : e.status === "considering" ? "検討中" : "見送り";
    const scores = `jpDemand=${e.predictedScores.jpDemand}, jpGap=${e.predictedScores.jpGap}`;
    return `- "${e.title_en}" (${e.marketCategory}): ${scores} → ${outcome}`;
  });

  return lines.join("\n");
}

// ── バイアス分析 ──

/** フィードバック蓄積データからバイアスレポートを生成 */
export function computeBiasReport(feedback: FeedbackEntry[]): BiasReport {
  const outcomeEntries = feedback.filter(
    (e) => e.status === "succeeded" || e.status === "failed"
  );

  const sampleSize = outcomeEntries.length;
  const reliability: BiasReport["reliability"] =
    sampleSize < 10 ? "low" : sampleSize < 30 ? "medium" : "high";

  // 成功事例と失敗事例の軸別平均予測スコアを比較し、バイアスを算出
  const axisAccuracy: BiasReport["axisAccuracy"] = {};
  const succeededEntries = outcomeEntries.filter((e) => e.status === "succeeded");
  const failedEntries = outcomeEntries.filter((e) => e.status === "failed");
  for (const axis of ["jpDemand", "jpGap", "traceSpeed", "riskLow"] as const) {
    if (outcomeEntries.length === 0) {
      axisAccuracy[axis] = { predicted: 0, actual: 0, bias: 0 };
      continue;
    }
    const predicted = outcomeEntries.reduce((sum, e) => sum + e.predictedScores[axis], 0) / outcomeEntries.length;
    const avgSucceeded = succeededEntries.length > 0
      ? succeededEntries.reduce((sum, e) => sum + e.predictedScores[axis], 0) / succeededEntries.length
      : 0;
    const avgFailed = failedEntries.length > 0
      ? failedEntries.reduce((sum, e) => sum + e.predictedScores[axis], 0) / failedEntries.length
      : 0;
    // bias > 0: 失敗したものにも高スコアを付けていた（楽観バイアス）
    // bias < 0: 成功したものに低スコアを付けていた（悲観バイアス）
    const actual = succeededEntries.length > 0 ? avgSucceeded : predicted;
    const bias = failedEntries.length > 0 ? avgFailed - avgSucceeded : 0;
    axisAccuracy[axis] = { predicted, actual, bias };
  }

  // カテゴリ別内訳（全フィードバックを対象、succeeded/failedをハイライト）
  const categoryBreakdown: BiasReport["categoryBreakdown"] = {};
  for (const e of outcomeEntries) {
    const cat = e.marketCategory;
    if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { succeeded: 0, failed: 0, total: 0 };
    categoryBreakdown[cat].total++;
    if (e.status === "succeeded") categoryBreakdown[cat].succeeded++;
    if (e.status === "failed") categoryBreakdown[cat].failed++;
  }

  return { sampleSize, reliability, axisAccuracy, categoryBreakdown };
}

/** フィードバックのMap（candidateId → FeedbackStatus） */
export function feedbackStatusMap(feedback: FeedbackEntry[]): Map<string, FeedbackStatus> {
  return new Map(feedback.map((e) => [e.candidateId, e.status]));
}
