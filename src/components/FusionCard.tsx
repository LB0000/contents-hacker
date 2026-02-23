import type { FusionIdea } from "@/lib/types";
import { Zap, Target, Lightbulb } from "lucide-react";

function ScoreDots({ score, max = 5, label }: { score: number; max?: number; label: string }) {
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${label}: ${Math.min(score, max)}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i < score ? "bg-primary-light" : "bg-surface-overlay"
          }`}
        />
      ))}
    </span>
  );
}

export function FusionCard({ idea }: { idea: FusionIdea }) {
  return (
    <div className="bg-surface-raised border border-border-default rounded-lg p-4 space-y-3 hover:border-primary-light/50 transition-colors duration-200">
      {/* Header: A x B = C */}
      <div className="flex items-center gap-2 text-xs">
        <span className="px-2 py-1 bg-surface-overlay rounded text-text-secondary truncate max-w-[120px]">
          {idea.candidateA.title_ja}
        </span>
        <Zap size={12} className="text-yellow-400 flex-shrink-0" />
        <span className="px-2 py-1 bg-surface-overlay rounded text-text-secondary truncate max-w-[120px]">
          {idea.candidateB.title_ja}
        </span>
      </div>

      {/* Fusion Name */}
      <div className="font-bold text-sm text-primary-light flex items-center gap-1.5">
        <Lightbulb size={14} className="text-yellow-400 flex-shrink-0" />
        {idea.fusionName}
      </div>

      {/* Concept */}
      <p className="text-xs text-text-secondary leading-relaxed">
        {idea.concept}
      </p>

      {/* Target */}
      <div className="flex items-start gap-1.5 text-xs text-text-muted">
        <Target size={10} className="mt-0.5 flex-shrink-0" />
        <span>{idea.jpTarget}</span>
      </div>

      {/* Scores */}
      <div className="flex gap-4 text-[10px] text-text-muted">
        <span className="flex items-center gap-1.5">
          実現性 <ScoreDots score={idea.feasibility} label="実現性" />
        </span>
        <span className="flex items-center gap-1.5">
          新規性 <ScoreDots score={idea.novelty} label="新規性" />
        </span>
      </div>

      {/* Reasoning */}
      <div className="text-[10px] text-text-muted border-t border-border-default/50 pt-2">
        {idea.reasoning}
      </div>
    </div>
  );
}
