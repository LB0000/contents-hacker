export interface ProgressStep {
  key: string;
  label: string;
  status: "pending" | "active" | "done";
  detail?: string;
}

export const INITIAL_STEPS: ProgressStep[] = [
  { key: "fetch", label: "取得", status: "pending" },
  { key: "normalize", label: "圧縮", status: "pending" },
  { key: "eval", label: "AI評価", status: "pending" },
  { key: "pairwise", label: "比較", status: "pending" },
  { key: "deepdive", label: "深掘り", status: "pending" },
  { key: "plan", label: "計画生成", status: "pending" },
];

export function deriveSteps(stepKey: string, message: string): ProgressStep[] {
  const steps = INITIAL_STEPS.map((s) => ({ ...s }));

  const transitions: Record<string, { doneUpTo: number; activeIdx?: number }> = {
    fetch:               { doneUpTo: -1, activeIdx: 0 },
    fetch_source_status: { doneUpTo: -1, activeIdx: 0 },
    fetch_done:          { doneUpTo: 1 },
    eval:                { doneUpTo: 1, activeIdx: 2 },
    eval_done:           { doneUpTo: 2 },
    pairwise:            { doneUpTo: 2, activeIdx: 3 },
    pairwise_done:       { doneUpTo: 3 },
    deepdive:            { doneUpTo: 3, activeIdx: 4 },
    deepdive_done:       { doneUpTo: 4 },
    plan:                { doneUpTo: 4, activeIdx: 5 },
  };

  const t = transitions[stepKey];
  if (!t) return steps;

  for (let i = 0; i <= t.doneUpTo; i++) steps[i].status = "done";
  if (t.activeIdx !== undefined) {
    steps[t.activeIdx].status = "active";
    steps[t.activeIdx].detail = message;
  } else if (t.doneUpTo >= 0) {
    steps[t.doneUpTo].detail = message;
  }

  return steps;
}
