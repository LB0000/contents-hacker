"use client";

import { useState, useEffect } from "react";
import type { MarketSimulation } from "@/lib/types";
import { TrendingUp, AlertTriangle, BookOpen, Loader2 } from "lucide-react";

type ScenarioKey = "optimistic" | "base" | "pessimistic";

const SCENARIO_LABELS: Record<ScenarioKey, { label: string; color: string }> = {
  optimistic: { label: "楽観", color: "text-green-400" },
  base: { label: "基準", color: "text-blue-400" },
  pessimistic: { label: "悲観", color: "text-red-400" },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatYen(n: number): string {
  if (n >= 1_000_000) return `¥${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `¥${(n / 1_000).toFixed(0)}K`;
  return `¥${n.toLocaleString()}`;
}

export function SimulationCard({
  simulation,
  isLoading,
  onRequest,
}: {
  simulation?: MarketSimulation;
  isLoading: boolean;
  onRequest: () => void;
}) {
  const [scenario, setScenario] = useState<ScenarioKey>("base");

  useEffect(() => { setScenario("base"); }, [simulation?.candidateId]);

  if (!simulation && !isLoading) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onRequest(); }}
        className="mt-2 text-[11px] px-2 py-1 rounded bg-indigo-900 text-indigo-300 hover:bg-indigo-800 transition-colors cursor-pointer flex items-center gap-1"
      >
        <TrendingUp size={11} />
        市場シミュレーション
      </button>
    );
  }

  if (isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
        <Loader2 size={12} className="animate-spin" />
        市場シミュレーション実行中...
      </div>
    );
  }

  if (!simulation) return null;

  const kpi = simulation.scenarios[scenario];

  return (
    <div className="mt-3 p-3 bg-surface-overlay rounded-lg border border-border-default space-y-2 expand-enter">
      <div className="flex items-center gap-2 text-xs font-medium text-indigo-300">
        <TrendingUp size={12} />
        市場シミュレーション
        <span className="text-[9px] text-text-muted">* AIによる推定値</span>
      </div>

      {/* TAM/SAM/SOM */}
      <div className="flex gap-2 text-[10px]">
        <span className="px-1.5 py-0.5 rounded bg-surface-raised text-text-secondary">TAM {simulation.tam}</span>
        <span className="px-1.5 py-0.5 rounded bg-surface-raised text-text-secondary">SAM {simulation.sam}</span>
        <span className="px-1.5 py-0.5 rounded bg-surface-raised text-text-secondary">SOM {simulation.som}</span>
      </div>

      {/* Scenario Tabs */}
      <div className="flex gap-1">
        {(["optimistic", "base", "pessimistic"] as const).map((s) => (
          <button
            key={s}
            onClick={(e) => { e.stopPropagation(); setScenario(s); }}
            className={`text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors ${
              scenario === s
                ? `bg-surface-raised ${SCENARIO_LABELS[s].color} font-medium`
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {SCENARIO_LABELS[s].label}
          </button>
        ))}
      </div>

      {/* KPI Table */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="bg-surface-raised rounded p-1.5">
          <div className="text-text-muted">MAU</div>
          <div className={`font-mono font-medium ${SCENARIO_LABELS[scenario].color}`}>
            {formatNumber(kpi.mau)}
          </div>
        </div>
        <div className="bg-surface-raised rounded p-1.5">
          <div className="text-text-muted">MRR</div>
          <div className={`font-mono font-medium ${SCENARIO_LABELS[scenario].color}`}>
            {formatYen(kpi.mrr)}
          </div>
        </div>
        <div className="bg-surface-raised rounded p-1.5">
          <div className="text-text-muted">CVR</div>
          <div className={`font-mono font-medium ${SCENARIO_LABELS[scenario].color}`}>
            {kpi.cvr.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Risks */}
      {simulation.riskFactors.length > 0 && (
        <div className="text-[10px]">
          <div className="flex items-center gap-1 text-yellow-400 mb-0.5">
            <AlertTriangle size={10} />
            リスク要因
          </div>
          <ul className="list-disc list-inside text-text-muted space-y-0.5">
            {simulation.riskFactors.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* References */}
      {simulation.referenceCases.length > 0 && (
        <div className="text-[10px]">
          <div className="flex items-center gap-1 text-text-muted mb-0.5">
            <BookOpen size={10} />
            参考事例
          </div>
          <ul className="list-disc list-inside text-text-secondary space-y-0.5">
            {simulation.referenceCases.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Reasoning */}
      <div className="text-[10px] text-text-muted italic">
        {simulation.reasoning}
      </div>
    </div>
  );
}
