import type { MvpPlan, RunResult } from "./types";

/** Escape markdown special characters in LLM-generated text */
function escMd(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([*_~`\[\]#|>])/g, "\\$1");
}

export function planToMarkdown(plan: MvpPlan, rank: number): string {
  return `## #${rank} ${escMd(plan.title)}

- **元プロダクト:** ${plan.originalUrl}
- **日本ターゲット:** ${escMd(plan.jpTarget)}
- **ローカライズ:** ${escMd(plan.localization)}
- **技術アプローチ:** ${escMd(plan.techApproach)}
- **ローンチ計画:** ${escMd(plan.launchPlan)}
- **マネタイズ:** ${escMd(plan.monetization)}
`;
}

export function resultToMarkdown(result: RunResult): string {
  const lines: string[] = ["# Contents Hacker レポート", ""];

  if (result.topPlans.length > 0) {
    lines.push("## Top トレース計画", "");
    result.topPlans.forEach((plan, i) => {
      lines.push(planToMarkdown(plan, i + 1));
    });
  }

  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const passed = result.candidates.filter((c) => c.gate.result !== "fail");
  if (passed.length > 0) {
    lines.push("## PASS / MAYBE 候補一覧", "");
    lines.push("| # | Src | Cat | Title | 速度 | 需要 | 空白 | Risk | Total |");
    lines.push("|---|-----|-----|-------|------|------|------|------|-------|");
    passed
      .sort((a, b) => b.totalScore - a.totalScore)
      .forEach((c, i) => {
        const s = c.scores;
        lines.push(
          `| ${i + 1} | ${c.source} | ${c.marketCategory ?? "other"} | ${esc(c.title_ja)} | ${s?.traceSpeed.score ?? "-"} | ${s?.jpDemand.score ?? "-"} | ${s?.jpGap.score ?? "-"} | ${s?.riskLow.score ?? "-"} | ${c.totalScore} |`
        );
      });
    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push("## Errors", "");
    result.errors.forEach((e) => lines.push(`- ${e}`));
    lines.push("");
  }

  return lines.join("\n");
}

export function downloadMarkdown(result: RunResult) {
  const md = resultToMarkdown(result);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contents-hacker-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
