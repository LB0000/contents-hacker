import type { Candidate } from "@/lib/types";
import { SOURCE_BADGE, safeHref } from "@/lib/constants";
import { CATEGORY_BADGE } from "@/lib/categories";
import { type ScoreWeights, calcWeightedTotal } from "@/lib/scores";
import { ScoreBar } from "./ScoreBar";
import { ExpandedDetails } from "./ExpandedDetails";
import { ChevronRight, ChevronDown } from "lucide-react";

export function CandidateRow({
  candidate: c,
  rank,
  tier,
  isNew,
  isExpanded,
  onToggle,
  weights,
}: {
  candidate: Candidate;
  rank: number;
  tier: 1 | 2 | 3;
  isNew: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  weights: ScoreWeights;
}) {
  const { label, color } = SOURCE_BADGE[c.source];
  const catBadge = CATEGORY_BADGE[c.marketCategory ?? "other"];
  const wTotal = calcWeightedTotal(c, weights);

  const tierStyle = tier === 1
    ? "border-l-2 border-l-tier1-accent bg-tier1-bg"
    : tier === 3
    ? "opacity-60"
    : "";

  return (
    <>
      <tr
        className={`border-b border-border-default/50 hover:bg-surface-hover/50 cursor-pointer transition-colors duration-150 ${tierStyle}`}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <td className="py-2 pr-3 text-text-muted">
          <span className="flex items-center gap-1">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {rank}
            {isNew && (
              <span className="text-[10px] px-1 py-0.5 bg-yellow-800 text-yellow-300 rounded font-bold">
                NEW
              </span>
            )}
            {c.deepDived && (
              <span className="text-[10px] px-1 py-0.5 bg-cyan-900 text-cyan-300 rounded font-bold" title="深掘り再評価済み">
                DD
              </span>
            )}
          </span>
        </td>
        <td className="py-2 pr-3">
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${color}`}>
            {label}
          </span>
          <span className={`text-[9px] px-1 py-0.5 rounded ml-1 ${catBadge.color}`}>
            {catBadge.label}
          </span>
        </td>
        <td className="py-2 pr-1 text-center text-xs text-text-secondary font-mono">
          {c.sourceScore != null ? c.sourceScore.toLocaleString() : "-"}
        </td>
        <td className="py-2 pr-3 max-w-md">
          <a
            href={safeHref(c.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-light hover:underline block truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {c.title_en}
          </a>
          <span className="text-xs text-text-muted block truncate">
            {c.title_ja} — {c.desc_ja}
          </span>
          {c.jpCompetitors.length > 0 && (
            <span className="flex gap-1 mt-0.5 flex-wrap">
              {c.jpCompetitors.map((comp, i) => (
                <span
                  key={i}
                  className="text-[9px] px-1 py-0.5 bg-surface-overlay text-text-secondary rounded"
                >
                  {comp}
                </span>
              ))}
            </span>
          )}
        </td>
        <td className="py-2 pr-3">
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              c.gate.pass ? "bg-green-900 text-green-300" : "bg-surface-overlay text-text-muted"
            }`}
          >
            {c.gate.pass ? "PASS" : "FAIL"}
          </span>
        </td>
        <td className="py-2 pr-1">
          {c.scores ? <ScoreBar score={c.scores.traceSpeed.score} /> : <span className="text-text-muted text-center block">-</span>}
        </td>
        <td className="py-2 pr-1">
          {c.scores ? <ScoreBar score={c.scores.jpDemand.score} /> : <span className="text-text-muted text-center block">-</span>}
        </td>
        <td className="py-2 pr-1">
          {c.scores ? <ScoreBar score={c.scores.jpGap.score} /> : <span className="text-text-muted text-center block">-</span>}
        </td>
        <td className="py-2 pr-1">
          {c.scores ? <ScoreBar score={c.scores.riskLow.score} /> : <span className="text-text-muted text-center block">-</span>}
        </td>
        <td className={`py-2 text-center font-semibold ${tier === 1 ? "text-tier1-accent" : ""}`}>
          {wTotal > 0 ? (Number.isInteger(wTotal) ? wTotal : wTotal.toFixed(1)) : "-"}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-surface-raised/80">
          <td colSpan={10} className="px-4 py-3">
            <ExpandedDetails candidate={c} />
          </td>
        </tr>
      )}
    </>
  );
}
