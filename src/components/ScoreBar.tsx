import { scoreColor, scoreBgColor } from "@/lib/scores";

export function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 5) * 100));
  return (
    <div
      className="flex items-center gap-1 justify-center"
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={5}
      aria-label={`スコア: ${score}/5`}
    >
      <span className={`text-xs font-mono w-3 text-right ${scoreColor(score)}`} aria-hidden="true">{score}</span>
      <div className="w-8 h-1.5 bg-surface-overlay rounded-full overflow-hidden" aria-hidden="true">
        <div
          className={`h-full rounded-full score-bar-fill ${scoreBgColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
