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
    return raw ? JSON.parse(raw) : [];
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
