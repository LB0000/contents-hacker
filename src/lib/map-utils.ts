import type { Candidate, MapAxis } from "./types";

const AXIS_LABELS: Record<MapAxis, string> = {
  jpDemand: "日本需要",
  jpGap: "日本空白度",
  traceSpeed: "トレース速度",
  riskLow: "リスク低",
  overseasPopularity: "海外注目度",
  totalScore: "総合スコア",
};

export function getAxisLabel(axis: MapAxis): string {
  return AXIS_LABELS[axis];
}

export function getAxisValue(candidate: Candidate, axis: MapAxis): number {
  switch (axis) {
    case "jpDemand": return candidate.scores?.jpDemand.score ?? 0;
    case "jpGap": return candidate.scores?.jpGap.score ?? 0;
    case "traceSpeed": return candidate.scores?.traceSpeed.score ?? 0;
    case "riskLow": return candidate.scores?.riskLow.score ?? 0;
    case "overseasPopularity": return candidate.overseasPopularity ?? 0;
    case "totalScore": return candidate.totalScore;
  }
}

export function getAxisRange(axis: MapAxis): [number, number] {
  if (axis === "overseasPopularity") return [0, 1];
  if (axis === "totalScore") return [0, 35]; // jpDemand*jpGap(25) + traceSpeed(5) + riskLow(5)
  return [0, 5];
}

export function getGateColor(gate: string): string {
  switch (gate) {
    case "pass": return "#22C55E";
    case "maybe": return "#EAB308";
    case "fail": return "#6B7280";
    default: return "#6B7280";
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  "ec-optimize": "#F97316",
  "analog-dx": "#06B6D4",
  "info-gap-ai": "#8B5CF6",
  "marketplace": "#EC4899",
  "vertical-saas": "#3B82F6",
  "devtool": "#10B981",
  "ai-tool": "#F59E0B",
  "other": "#6B7280",
};

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#6B7280";
}

const SOURCE_COLORS: Record<string, string> = {
  producthunt: "#F97316",
  hackernews: "#10B981",
  github: "#8B5CF6",
  reddit: "#3B82F6",
  indiehackers: "#EC4899",
  betalist: "#14B8A6",
};

export function getSourceColor(source: string): string {
  return SOURCE_COLORS[source] ?? "#6B7280";
}
