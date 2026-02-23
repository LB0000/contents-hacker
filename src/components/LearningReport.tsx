"use client";

import { useState } from "react";
import type { FeedbackEntry } from "@/lib/types";
import { computeBiasReport } from "@/lib/feedback";
import { CATEGORY_BADGE } from "@/lib/categories";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";

export function LearningReport({ feedback }: { feedback: FeedbackEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (feedback.length === 0) return null;

  const report = computeBiasReport(feedback);
  const outcomeCount = feedback.filter((e) => e.status === "succeeded" || e.status === "failed").length;

  return (
    <div className="mt-4 border border-border-default rounded-lg bg-surface-raised">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Brain size={12} className="text-purple-400" />
        <span>学習データ ({feedback.length}件蓄積)</span>
        <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${
          report.reliability === "high" ? "bg-green-900 text-green-300" :
          report.reliability === "medium" ? "bg-yellow-900 text-yellow-300" :
          "bg-surface-overlay text-text-muted"
        }`}>
          信頼度: {report.reliability}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 text-xs expand-enter">
          {/* ステータス内訳 */}
          <div className="flex gap-3 text-text-muted">
            {(["succeeded", "failed", "started", "considering", "skipped"] as const).map((s) => {
              const count = feedback.filter((e) => e.status === s).length;
              if (count === 0) return null;
              const labels: Record<string, string> = {
                succeeded: "成功", failed: "失敗", started: "着手", considering: "検討中", skipped: "見送り",
              };
              return (
                <span key={s}>
                  {labels[s]}: <span className="text-text-secondary font-mono">{count}</span>
                </span>
              );
            })}
          </div>

          {/* バイアス分析（結果が10件以上の場合） */}
          {outcomeCount >= 5 && (
            <div>
              <div className="text-text-muted font-medium mb-1">予測精度（成功/失敗 {outcomeCount}件から算出）</div>
              <div className="grid grid-cols-4 gap-2">
                {(["jpDemand", "jpGap", "traceSpeed", "riskLow"] as const).map((axis) => {
                  const { predicted, bias } = report.axisAccuracy[axis] ?? { predicted: 0, bias: 0 };
                  const labels: Record<string, string> = {
                    jpDemand: "需要", jpGap: "空白", traceSpeed: "速度", riskLow: "Risk",
                  };
                  return (
                    <div key={axis} className="bg-surface-overlay rounded p-1.5">
                      <div className="text-text-muted">{labels[axis]}</div>
                      <div className="font-mono">
                        <span className="text-text-secondary">{predicted.toFixed(1)}</span>
                        <span className={`ml-1 ${bias > 0.5 ? "text-red-400" : bias < -0.5 ? "text-blue-400" : "text-text-muted"}`}>
                          ({bias > 0 ? "+" : ""}{bias.toFixed(1)})
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {Object.values(report.axisAccuracy).some((a) => Math.abs(a.bias) > 0.5) && (
                <div className="text-yellow-400 mt-1">
                  * バイアスが検出されました。Few-shot例による補正が次回の評価に反映されます。
                </div>
              )}
            </div>
          )}

          {/* カテゴリ別内訳 */}
          {Object.keys(report.categoryBreakdown).length > 0 && (
            <div>
              <div className="text-text-muted font-medium mb-1">カテゴリ別</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(report.categoryBreakdown).map(([cat, data]) => {
                  const badge = CATEGORY_BADGE[cat as keyof typeof CATEGORY_BADGE];
                  return (
                    <span key={cat} className={`px-1.5 py-0.5 rounded text-[10px] ${badge?.color ?? "bg-surface-overlay text-text-muted"}`}>
                      {badge?.label ?? cat}: {data.total}件
                      {data.succeeded > 0 && <span className="text-green-300 ml-0.5">({data.succeeded}成功)</span>}
                      {data.failed > 0 && <span className="text-red-300 ml-0.5">({data.failed}失敗)</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
