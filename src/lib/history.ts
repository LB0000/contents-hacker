import type { Candidate, MvpPlan, RunResult } from "./types";
import { HISTORY_KEY, MAX_HISTORY } from "./constants";

export interface RunHistory {
  timestamp: string;
  candidates: Candidate[];
  topPlans: MvpPlan[];
}

export function loadHistory(): RunHistory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (h: unknown): h is RunHistory =>
          typeof h === "object" &&
          h !== null &&
          typeof (h as Record<string, unknown>).timestamp === "string" &&
          Array.isArray((h as Record<string, unknown>).candidates)
      )
      .map((h) => ({
        ...h,
        topPlans: Array.isArray(h.topPlans) ? h.topPlans : [],
        candidates: h.candidates.map((c) => ({
          ...c,
          marketCategory: c.marketCategory ?? ("other" as const),
        })),
      }));
  } catch {
    return [];
  }
}

export function saveHistory(result: RunResult) {
  const history = loadHistory();
  history.unshift({
    timestamp: new Date().toISOString(),
    candidates: result.candidates,
    topPlans: result.topPlans,
  });
  while (history.length > MAX_HISTORY) history.pop();
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    while (history.length > 1) {
      history.pop();
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        return;
      } catch { /* continue shrinking */ }
    }
  }
}

export function getPreviousIds(history: RunHistory[], currentIndex: number): Set<string> {
  const next = history[currentIndex + 1];
  if (!next) return new Set();
  return new Set(next.candidates.map((c) => c.id));
}
