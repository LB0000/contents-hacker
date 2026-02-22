import type { Candidate } from "@/lib/types";
import { CONFIDENCE_BADGE } from "@/lib/constants";
import { CATEGORY_BADGE } from "@/lib/categories";

export function ExpandedDetails({ candidate: c }: { candidate: Candidate }) {
  return (
    <div className="text-xs text-text-secondary space-y-1.5 expand-enter">
      <div>
        <span className="text-text-muted font-medium">Gate:</span>{" "}
        <span className={c.gate.result === "pass" ? "text-gate-pass" : c.gate.result === "maybe" ? "text-yellow-400" : "text-score-low"}>
          {c.gate.result.toUpperCase()}
        </span>{" "}
        — {c.gate.reason_ja}
      </div>
      {c.scores && (
        <>
          {(["traceSpeed", "jpDemand", "jpGap", "riskLow"] as const).map((key) => {
            const entry = c.scores?.[key];
            if (!entry) return null;
            const labels: Record<string, string> = { traceSpeed: "速度", jpDemand: "需要", jpGap: "空白", riskLow: "Risk" };
            return (
              <div key={key}>
                <span className="text-text-muted font-medium">{labels[key]} {entry.score}:</span>{" "}
                {entry.confidence && <span className={CONFIDENCE_BADGE[entry.confidence] ?? ""}>[{entry.confidence}]</span>}{" "}
                {entry.reason_ja}
              </div>
            );
          })}
          {c.deepDived && (
            <div className="text-cyan-400 font-medium">
              * 深掘り再評価済み（jpDemand / jpGap のスコアが更新されました）
            </div>
          )}
        </>
      )}
      <div>
        <span className="text-text-muted font-medium">カテゴリ:</span>{" "}
        <span className={`px-1.5 py-0.5 rounded ${CATEGORY_BADGE[c.marketCategory ?? "other"].color}`}>
          {CATEGORY_BADGE[c.marketCategory ?? "other"].label}
        </span>
      </div>
      <div>
        <span className="text-text-muted font-medium">日本競合:</span>{" "}
        {c.jpCompetitors.length > 0 ? c.jpCompetitors.join(", ") : "なし（空白市場）"}
      </div>
    </div>
  );
}
