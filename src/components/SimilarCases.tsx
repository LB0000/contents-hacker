"use client";

import type { SimilarCase } from "@/lib/types";
import { ArrowUpRight, AlertTriangle, Minus } from "lucide-react";

const OUTCOME_BADGE: Record<string, { color: string; label: string }> = {
  success: { color: "bg-green-900 text-green-300", label: "成功" },
  failure: { color: "bg-red-900 text-red-300", label: "失敗" },
  ongoing: { color: "bg-surface-raised text-text-muted", label: "進行中" },
};

const SIGNAL_BADGE: Record<SimilarCase["signal"], { icon: typeof ArrowUpRight; color: string; label: string }> = {
  boost: { icon: ArrowUpRight, color: "text-green-400", label: "成功事例に類似" },
  warning: { icon: AlertTriangle, color: "text-red-400", label: "失敗事例に類似" },
  neutral: { icon: Minus, color: "text-text-muted", label: "参考" },
};

export function SimilarCases({ cases }: { cases: SimilarCase[] }) {
  if (cases.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="text-[10px] text-text-muted font-medium">類似トレース事例</div>
      {cases.map((sc) => {
        const { icon: Icon, color, label } = SIGNAL_BADGE[sc.signal];
        return (
          <div
            key={sc.caseEntry.id}
            className="flex items-start gap-2 text-[10px] bg-surface-overlay rounded px-2 py-1"
          >
            <Icon size={10} className={`mt-0.5 flex-shrink-0 ${color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-text-primary">
                  {sc.caseEntry.originalProduct} → {sc.caseEntry.jpTraceProduct}
                </span>
                <span className={`px-1 py-0 rounded ${
                  OUTCOME_BADGE[sc.caseEntry.outcome]?.color ?? "bg-surface-raised text-text-muted"
                }`}>
                  {OUTCOME_BADGE[sc.caseEntry.outcome]?.label ?? sc.caseEntry.outcome}
                </span>
                <span className="text-text-muted font-mono">
                  {(sc.similarity * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-text-muted truncate">{sc.caseEntry.summary}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
