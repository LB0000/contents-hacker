"use client";

import type { FusionIdea } from "@/lib/types";
import { FusionCard } from "./FusionCard";
import { Sparkles, Loader2 } from "lucide-react";

export function FusionSection({
  fusions,
  isLoading,
  onGenerate,
  hasCandidates,
}: {
  fusions: FusionIdea[];
  isLoading: boolean;
  onGenerate: () => void;
  hasCandidates: boolean;
}) {
  if (!hasCandidates) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Sparkles size={18} className="text-yellow-400" />
          プロダクト融合
        </h2>
        {fusions.length === 0 && (
          <button
            onClick={onGenerate}
            disabled={isLoading}
            className="px-4 py-1.5 bg-surface-overlay hover:bg-surface-hover text-text-secondary rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles size={12} />
                融合提案を生成
              </>
            )}
          </button>
        )}
      </div>

      {fusions.length === 0 && !isLoading && (
        <p className="text-xs text-text-muted">
          異カテゴリの上位候補を掛け合わせ、新しいハイブリッドプロダクトを提案します。
        </p>
      )}

      {fusions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {fusions.map((idea, i) => (
            <div key={i} className={`animate-fade-slide-up ${i > 0 ? `animate-delay-${Math.min(i, 3) * 100}` : ""}`}>
              <FusionCard idea={idea} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
