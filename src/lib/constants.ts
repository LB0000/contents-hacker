import type { SourceType, GateLevel } from "./types";

export const SOURCE_BADGE: Record<SourceType, { label: string; color: string }> = {
  producthunt: { label: "PH", color: "bg-orange-900 text-orange-300" },
  hackernews: { label: "HN", color: "bg-emerald-900 text-emerald-300" },
  github: { label: "GH", color: "bg-purple-900 text-purple-300" },
  reddit: { label: "RD", color: "bg-blue-900 text-blue-300" },
  indiehackers: { label: "IH", color: "bg-pink-900 text-pink-300" },
  betalist: { label: "BL", color: "bg-teal-900 text-teal-300" },
};

export const GATE_BADGE: Record<GateLevel, { label: string; color: string }> = {
  pass: { label: "PASS", color: "bg-green-900 text-green-300" },
  maybe: { label: "MAYBE", color: "bg-orange-900 text-orange-300" },
  fail: { label: "FAIL", color: "bg-surface-overlay text-text-muted" },
};

export const CONFIDENCE_BADGE: Record<string, string> = {
  high: "text-green-400",
  medium: "text-yellow-400",
  low: "text-red-400",
};

export const WEIGHT_LABELS: Record<string, string> = {
  traceSpeed: "速度",
  jpDemand: "需要",
  jpGap: "空白",
  riskLow: "Risk",
};

export const WEIGHT_KEYS = ["traceSpeed", "jpDemand", "jpGap", "riskLow"] as const;

export const WEIGHTS_KEY = "ch-weights";
export const HISTORY_KEY = "ch-history";
export const MAX_HISTORY = 5;

export type SortKey = "totalScore" | "traceSpeed" | "jpDemand" | "jpGap" | "riskLow" | "sourceScore" | "overseasPopularity";

/** Validates that a URL uses http(s) scheme. Returns "#" for unsafe URLs. */
export function safeHref(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return url;
  } catch { /* invalid URL */ }
  return "#";
}
