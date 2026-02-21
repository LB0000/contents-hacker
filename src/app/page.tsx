"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { RunResult, Candidate, MvpPlan, SourceType } from "@/lib/types";

// ---------- 履歴管理 ----------

interface RunHistory {
  timestamp: string;
  candidates: Candidate[];
  topPlans: MvpPlan[];
}

const HISTORY_KEY = "ch-history";
const MAX_HISTORY = 5;

function loadHistory(): RunHistory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(result: RunResult) {
  const history = loadHistory();
  history.unshift({
    timestamp: new Date().toISOString(),
    candidates: result.candidates,
    topPlans: result.topPlans,
  });
  while (history.length > MAX_HISTORY) history.pop();
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // QuotaExceededError: 古い履歴を削除してリトライ
    while (history.length > 1) {
      history.pop();
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        return;
      } catch { /* continue shrinking */ }
    }
  }
}

function getPreviousIds(history: RunHistory[], currentIndex: number): Set<string> {
  const next = history[currentIndex + 1];
  if (!next) return new Set();
  return new Set(next.candidates.map((c) => c.id));
}

// ---------- ソースバッジ ----------

const SOURCE_BADGE: Record<SourceType, { label: string; color: string }> = {
  producthunt: { label: "PH", color: "bg-orange-900 text-orange-300" },
  hackernews: { label: "HN", color: "bg-emerald-900 text-emerald-300" },
  github: { label: "GH", color: "bg-purple-900 text-purple-300" },
  reddit: { label: "RD", color: "bg-blue-900 text-blue-300" },
};

// ---------- スコア色分け ----------

function scoreColor(score: number): string {
  if (score >= 4) return "text-green-400";
  if (score >= 2) return "text-yellow-400";
  return "text-red-400";
}

function scoreBgColor(score: number): string {
  if (score >= 4) return "bg-green-500";
  if (score >= 2) return "bg-yellow-500";
  return "bg-red-500";
}

// ---------- スコア重み ----------

interface ScoreWeights {
  traceSpeed: number;
  jpDemand: number;
  jpGap: number;
  riskLow: number;
}

const WEIGHTS_KEY = "ch-weights";
const DEFAULT_WEIGHTS: ScoreWeights = { traceSpeed: 1, jpDemand: 1, jpGap: 1, riskLow: 1 };
const WEIGHT_KEYS: (keyof ScoreWeights)[] = ["traceSpeed", "jpDemand", "jpGap", "riskLow"];
const WEIGHT_LABELS: Record<keyof ScoreWeights, string> = {
  traceSpeed: "速度",
  jpDemand: "需要",
  jpGap: "空白",
  riskLow: "Risk",
};

function loadWeights(): ScoreWeights {
  if (typeof window === "undefined") return DEFAULT_WEIGHTS;
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY);
    return raw ? { ...DEFAULT_WEIGHTS, ...JSON.parse(raw) } : DEFAULT_WEIGHTS;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

function calcWeightedTotal(c: Candidate, w: ScoreWeights): number {
  if (!c.scores) return 0;
  return (
    c.scores.traceSpeed.score * w.traceSpeed +
    c.scores.jpDemand.score * w.jpDemand +
    c.scores.jpGap.score * w.jpGap +
    c.scores.riskLow.score * w.riskLow
  );
}

// ---------- ソートキー ----------

type SortKey = "totalScore" | "traceSpeed" | "jpDemand" | "jpGap" | "riskLow" | "sourceScore";

function getScoreValue(c: Candidate, key: SortKey, weights: ScoreWeights): number {
  if (key === "totalScore") return calcWeightedTotal(c, weights);
  if (key === "sourceScore") return c.sourceScore ?? -1;
  if (!c.scores) return -1;
  return c.scores[key].score;
}

// ---------- プログレスステップ ----------

interface ProgressStep {
  key: string;
  label: string;
  status: "pending" | "active" | "done";
  detail?: string;
}

const INITIAL_STEPS: ProgressStep[] = [
  { key: "fetch", label: "取得", status: "pending" },
  { key: "normalize", label: "圧縮", status: "pending" },
  { key: "eval", label: "AI評価", status: "pending" },
  { key: "plan", label: "計画生成", status: "pending" },
];

function deriveSteps(stepKey: string, message: string): ProgressStep[] {
  const steps = INITIAL_STEPS.map((s) => ({ ...s }));

  const transitions: Record<string, { doneUpTo: number; activeIdx?: number }> = {
    fetch:               { doneUpTo: -1, activeIdx: 0 },
    fetch_source_status: { doneUpTo: -1, activeIdx: 0 },
    fetch_done:          { doneUpTo: 1 },
    eval:                { doneUpTo: 1, activeIdx: 2 },
    eval_done:           { doneUpTo: 2 },
    plan:                { doneUpTo: 2, activeIdx: 3 },
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

// ---------- コピー用Markdown生成 ----------

function planToMarkdown(plan: MvpPlan, rank: number): string {
  return `## #${rank} ${plan.title}

- **元プロダクト:** ${plan.originalUrl}
- **日本ターゲット:** ${plan.jpTarget}
- **ローカライズ:** ${plan.localization}
- **技術アプローチ:** ${plan.techApproach}
- **ローンチ計画:** ${plan.launchPlan}
- **マネタイズ:** ${plan.monetization}
`;
}

// ---------- Markdownエクスポート ----------

function resultToMarkdown(result: RunResult): string {
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

function downloadMarkdown(result: RunResult) {
  const md = resultToMarkdown(result);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contents-hacker-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- メインコンポーネント ----------

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(INITIAL_STEPS);
  const [result, setResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [compareIndex, setCompareIndex] = useState(0);

  // テーブル state
  const [sortKey, setSortKey] = useState<SortKey>("totalScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [gateFilter, setGateFilter] = useState<"all" | "pass" | "fail">("all");
  const [sourceFilter, setSourceFilter] = useState<SourceType | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [showWeights, setShowWeights] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    setWeights(loadWeights());
    return () => { abortRef.current?.abort(); };
  }, []);

  const previousIds = getPreviousIds(history, compareIndex);

  // SSE でパイプライン実行
  const handleRun = useCallback(async () => {
    // 前回のリクエストをキャンセル
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setResult(null);
    setProgress("開始...");
    setProgressSteps(INITIAL_STEPS);
    setExpandedId(null);

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`サーバーエラー: ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const dataLine = line.replace(/^data: /, "").trim();
          if (!dataLine) continue;

          try {
            const event = JSON.parse(dataLine);
            if (event.step === "done" && event.result) {
              const data: RunResult = event.result;
              setResult(data);
              setProgressSteps((prev) => prev.map((s) => ({ ...s, status: "done" as const })));
              if (data.candidates.length > 0) {
                saveHistory(data);
                setHistory(loadHistory());
                setCompareIndex(0);
              }
            } else if (event.step === "error") {
              setResult({
                candidates: [],
                topPlans: [],
                errors: [event.message],
              });
            } else {
              setProgress(event.message);
              setProgressSteps(deriveSteps(event.step, event.message));
            }
          } catch {
            // パース失敗は無視
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setResult({
        candidates: [],
        topPlans: [],
        errors: [e instanceof Error ? e.message : "不明なエラーが発生しました"],
      });
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, []);

  function loadFromHistory(index: number) {
    const h = history[index];
    if (!h) return;
    setResult({ candidates: h.candidates, topPlans: h.topPlans, errors: [] });
    setCompareIndex(index);
    setExpandedId(null);
  }

  // ソート切替
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // 重み変更
  function handleWeightChange(key: keyof ScoreWeights, value: number) {
    const next = { ...weights, [key]: value };
    setWeights(next);
    try {
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify(next));
    } catch { /* QuotaExceeded — weights still applied in state */ }
  }

  function resetWeights() {
    setWeights(DEFAULT_WEIGHTS);
    localStorage.removeItem(WEIGHTS_KEY);
  }

  const isDefaultWeights = WEIGHT_KEYS.every((k) => weights[k] === 1);

  // フィルタ + ソート済み候補
  const filteredCandidates = useMemo(() => {
    if (!result?.candidates) return [];
    let list = result.candidates;

    if (gateFilter !== "all") {
      list = list.filter((c) => (gateFilter === "pass" ? c.gate.pass : !c.gate.pass));
    }
    if (sourceFilter !== "all") {
      list = list.filter((c) => c.source === sourceFilter);
    }

    const sorted = [...list].sort((a, b) => {
      const av = getScoreValue(a, sortKey, weights);
      const bv = getScoreValue(b, sortKey, weights);
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return sorted;
  }, [result?.candidates, gateFilter, sourceFilter, sortKey, sortDir, weights]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Contents Hacker</h1>
        <p className="text-gray-400 mt-2">
          海外プロダクトを発見 → 日本トレースの可能性を自動評価
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={handleRun}
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Running...
              </span>
            ) : (
              "Run"
            )}
          </button>

          {result && result.candidates.length > 0 && (
            <button
              onClick={() => downloadMarkdown(result)}
              className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
            >
              Export .md
            </button>
          )}
          {history.length > 0 && (
            <select
              value={compareIndex}
              onChange={(e) => loadFromHistory(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300"
            >
              {history.map((h, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "Latest" : ""} {new Date(h.timestamp).toLocaleString("ja-JP")}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ステップ別プログレス表示 */}
        {loading && (
          <div className="mt-5 flex items-center justify-center gap-1">
            {progressSteps.map((step, i) => (
              <div key={step.key} className="flex items-center">
                {i > 0 && (
                  <div
                    className={`w-6 h-0.5 mx-0.5 transition-colors ${
                      step.status !== "pending" ? "bg-indigo-500" : "bg-gray-700"
                    }`}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      step.status === "done"
                        ? "bg-green-600 text-white"
                        : step.status === "active"
                        ? "bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-1 ring-offset-gray-950 animate-pulse"
                        : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {step.status === "done" ? (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`text-[10px] ${
                      step.status === "active" ? "text-indigo-400 font-medium" : "text-gray-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {loading && progress && (
          <p className="mt-2 text-xs text-gray-400">{progress}</p>
        )}
      </div>

      {/* Errors */}
      {result?.errors && result.errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg">
          <h2 className="font-semibold text-red-400 mb-2">Errors</h2>
          <ul className="text-sm text-red-300 space-y-1">
            {result.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Trace Plans */}
      {result?.topPlans && result.topPlans.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">Top 3 トレース計画</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {result.topPlans.map((plan, i) => (
              <TracePlanCard key={plan.id} plan={plan} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      {/* Candidates Table */}
      {result?.candidates && result.candidates.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold">
              Candidates ({filteredCandidates.length} / {result.candidates.length})
            </h2>
            <div className="flex gap-2 text-xs">
              {/* Gate フィルタ */}
              {(["all", "pass", "fail"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setGateFilter(v)}
                  className={`px-2 py-1 rounded ${
                    gateFilter === v
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {v === "all" ? "ALL" : v.toUpperCase()}
                </button>
              ))}
              <span className="text-gray-700">|</span>
              {/* Source フィルタ */}
              {(["all", "hackernews", "producthunt", "github", "reddit"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSourceFilter(v)}
                  className={`px-2 py-1 rounded ${
                    sourceFilter === v
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {v === "all" ? "ALL" : SOURCE_BADGE[v].label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowWeights((v) => !v)}
              className={`text-xs px-2 py-1 rounded ${
                showWeights || !isDefaultWeights
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {showWeights ? "重み ▲" : "重み ▼"}
            </button>
          </div>

          {/* 重みスライダーパネル */}
          {showWeights && (
            <div className="mb-4 p-3 bg-gray-900 border border-gray-800 rounded-lg flex items-center gap-4 flex-wrap">
              {WEIGHT_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-xs text-gray-300">
                  <span className="w-8 text-gray-500">{WEIGHT_LABELS[key]}</span>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.5}
                    value={weights[key]}
                    onChange={(e) => handleWeightChange(key, Number(e.target.value))}
                    className="w-20 accent-indigo-500"
                  />
                  <span className="w-6 text-right font-mono">{weights[key].toFixed(1)}</span>
                </label>
              ))}
              {!isDefaultWeights && (
                <button
                  onClick={resetWeights}
                  className="text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700"
                >
                  リセット
                </button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Src</th>
                  <SortableTh label="Pop" sortKey="sourceScore" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <th className="py-2 pr-3">Title / タイトル</th>
                  <th className="py-2 pr-3">Gate</th>
                  <SortableTh label="速度" sortKey="traceSpeed" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="需要" sortKey="jpDemand" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="空白" sortKey="jpGap" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="Risk" sortKey="riskLow" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <SortableTh label="Total" sortKey="totalScore" current={sortKey} dir={sortDir} onClick={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.map((c, i) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    rank={i + 1}
                    isNew={previousIds.size > 0 && !previousIds.has(c.id)}
                    isExpanded={expandedId === c.id}
                    onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    weights={weights}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Empty state */}
      {!loading && !result && (
        <p className="text-center text-gray-600 mt-16">
          &quot;Run&quot; を押して海外プロダクトを取得・評価
        </p>
      )}
    </main>
  );
}

// ---------- ソート可能ヘッダー ----------

function SortableTh({
  label,
  sortKey: key,
  current,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const arrow = current === key ? (dir === "desc" ? " ↓" : " ↑") : "";
  return (
    <th
      className="py-2 pr-1 text-center cursor-pointer hover:text-gray-200 select-none"
      onClick={() => onClick(key)}
    >
      {label}{arrow}
    </th>
  );
}

// ---------- スコアバー ----------

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 5) * 100;
  return (
    <div className="flex items-center gap-1 justify-center">
      <span className={`text-xs font-mono w-3 text-right ${scoreColor(score)}`}>{score}</span>
      <div className="w-8 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${scoreBgColor(score)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------- トレース計画カード ----------

function TracePlanCard({ plan, rank }: { plan: MvpPlan; rank: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(planToMarkdown(plan, rank));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable (HTTP, iframe, etc.)
    }
  };

  return (
    <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold bg-indigo-600 rounded-full w-6 h-6 flex items-center justify-center">
          {rank}
        </span>
        <h3 className="font-semibold truncate flex-1">{plan.title}</h3>
        <button
          onClick={handleCopy}
          className="text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors shrink-0"
          title="Markdownでコピー"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <dl className="text-xs text-gray-300 space-y-2">
        <div>
          <dt className="text-gray-500 font-medium">元プロダクト</dt>
          <dd>
            <a href={plan.originalUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline break-all">
              {plan.originalUrl}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 font-medium">日本ターゲット</dt>
          <dd>{plan.jpTarget}</dd>
        </div>
        <div>
          <dt className="text-gray-500 font-medium">ローカライズ</dt>
          <dd>{plan.localization}</dd>
        </div>
        <div>
          <dt className="text-gray-500 font-medium">技術アプローチ</dt>
          <dd>{plan.techApproach}</dd>
        </div>
        <div>
          <dt className="text-gray-500 font-medium">ローンチ計画</dt>
          <dd className="whitespace-pre-line">{plan.launchPlan}</dd>
        </div>
        <div>
          <dt className="text-gray-500 font-medium">マネタイズ</dt>
          <dd>{plan.monetization}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------- 候補行 ----------

function CandidateRow({
  candidate: c,
  rank,
  isNew,
  isExpanded,
  onToggle,
  weights,
}: {
  candidate: Candidate;
  rank: number;
  isNew: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  weights: ScoreWeights;
}) {
  const { label, color } = SOURCE_BADGE[c.source];
  const wTotal = calcWeightedTotal(c, weights);
  const maxPossible = 5 * (weights.traceSpeed + weights.jpDemand + weights.jpGap + weights.riskLow);
  const isHighScore = c.gate.pass && maxPossible > 0 && wTotal / maxPossible >= 0.8;

  return (
    <>
      <tr
        className={`border-b border-gray-800/50 hover:bg-gray-900/50 cursor-pointer ${
          isHighScore ? "bg-yellow-950/20" : ""
        }`}
        onClick={onToggle}
      >
        <td className="py-2 pr-3 text-gray-500">
          <span className="flex items-center gap-1">
            {rank}
            {isNew && (
              <span className="text-[10px] px-1 py-0.5 bg-yellow-800 text-yellow-300 rounded font-bold">
                NEW
              </span>
            )}
          </span>
        </td>
        <td className="py-2 pr-3">
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${color}`}>
            {label}
          </span>
        </td>
        <td className="py-2 pr-1 text-center text-xs text-gray-400 font-mono">
          {c.sourceScore != null ? c.sourceScore.toLocaleString() : "-"}
        </td>
        <td className="py-2 pr-3 max-w-md">
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:underline block truncate"
            onClick={(e) => e.stopPropagation()}
          >
            {c.title_en}
          </a>
          <span className="text-xs text-gray-500 block truncate">
            {c.title_ja} — {c.desc_ja}
          </span>
          {c.jpCompetitors.length > 0 && (
            <span className="flex gap-1 mt-0.5 flex-wrap">
              {c.jpCompetitors.map((comp, i) => (
                <span
                  key={i}
                  className="text-[9px] px-1 py-0.5 bg-gray-800 text-gray-400 rounded"
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
              c.gate.pass ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-500"
            }`}
          >
            {c.gate.pass ? "PASS" : "FAIL"}
          </span>
        </td>
        <td className="py-2 pr-1">
          {c.scores ? <ScoreBar score={c.scores.traceSpeed.score} /> : <span className="text-gray-600 text-center block">-</span>}
        </td>
        <td className="py-2 pr-1">
          {c.scores ? <ScoreBar score={c.scores.jpDemand.score} /> : <span className="text-gray-600 text-center block">-</span>}
        </td>
        <td className="py-2 pr-1">
          {c.scores ? <ScoreBar score={c.scores.jpGap.score} /> : <span className="text-gray-600 text-center block">-</span>}
        </td>
        <td className="py-2 pr-1">
          {c.scores ? <ScoreBar score={c.scores.riskLow.score} /> : <span className="text-gray-600 text-center block">-</span>}
        </td>
        <td className={`py-2 text-center font-semibold ${isHighScore ? "text-yellow-400" : ""}`}>
          {wTotal > 0 ? (Number.isInteger(wTotal) ? wTotal : wTotal.toFixed(1)) : "-"}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-900/80">
          <td colSpan={10} className="px-4 py-3">
            <ExpandedDetails candidate={c} />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------- 展開詳細 ----------

function ExpandedDetails({ candidate: c }: { candidate: Candidate }) {
  return (
    <div className="text-xs text-gray-300 space-y-1.5">
      <div>
        <span className="text-gray-500 font-medium">Gate:</span>{" "}
        <span className={c.gate.pass ? "text-green-400" : "text-red-400"}>
          {c.gate.pass ? "PASS" : "FAIL"}
        </span>{" "}
        — {c.gate.reason_ja}
      </div>
      {c.scores && (
        <>
          <div>
            <span className="text-gray-500 font-medium">速度 {c.scores.traceSpeed.score}:</span>{" "}
            {c.scores.traceSpeed.reason_ja}
          </div>
          <div>
            <span className="text-gray-500 font-medium">需要 {c.scores.jpDemand.score}:</span>{" "}
            {c.scores.jpDemand.reason_ja}
          </div>
          <div>
            <span className="text-gray-500 font-medium">空白 {c.scores.jpGap.score}:</span>{" "}
            {c.scores.jpGap.reason_ja}
          </div>
          <div>
            <span className="text-gray-500 font-medium">Risk {c.scores.riskLow.score}:</span>{" "}
            {c.scores.riskLow.reason_ja}
          </div>
        </>
      )}
      <div>
        <span className="text-gray-500 font-medium">日本競合:</span>{" "}
        {c.jpCompetitors.length > 0 ? c.jpCompetitors.join(", ") : "なし（空白市場）"}
      </div>
    </div>
  );
}
