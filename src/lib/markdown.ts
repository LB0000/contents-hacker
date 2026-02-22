import type { MvpPlan, RunResult } from "./types";

export function planToMarkdown(plan: MvpPlan, rank: number): string {
  return `## #${rank} ${plan.title}

- **元プロダクト:** ${plan.originalUrl}
- **日本ターゲット:** ${plan.jpTarget}
- **ローカライズ:** ${plan.localization}
- **技術アプローチ:** ${plan.techApproach}
- **ローンチ計画:** ${plan.launchPlan}
- **マネタイズ:** ${plan.monetization}
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

  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const passed = result.candidates.filter((c) => c.gate.pass);
  if (passed.length > 0) {
    lines.push("## PASS 候補一覧", "");
    lines.push("| # | Src | Title | 速度 | 需要 | 空白 | Risk | Total |");
    lines.push("|---|-----|-------|------|------|------|------|-------|");
    passed
      .sort((a, b) => b.totalScore - a.totalScore)
      .forEach((c, i) => {
        const s = c.scores;
        lines.push(
          `| ${i + 1} | ${c.source} | ${esc(c.title_ja)} | ${s?.traceSpeed.score ?? "-"} | ${s?.jpDemand.score ?? "-"} | ${s?.jpGap.score ?? "-"} | ${s?.riskLow.score ?? "-"} | ${c.totalScore} |`
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
  URL.revokeObjectURL(url);
}
