"use client";

import { useState, useEffect, useCallback } from "react";
import { runAction } from "./actions";
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
  // 最大5件に制限
  while (history.length > MAX_HISTORY) history.pop();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
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

// ---------- メインコンポーネント ----------

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [compareIndex, setCompareIndex] = useState(0);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const previousIds = getPreviousIds(history, compareIndex);

  const handleRun = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await runAction();
      setResult(data);
      saveHistory(data);
      setHistory(loadHistory());
      setCompareIndex(0);
    } catch (e) {
      setResult({
        candidates: [],
        topPlans: [],
        errors: [e instanceof Error ? e.message : "不明なエラーが発生しました"],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  function loadFromHistory(index: number) {
    const h = history[index];
    if (!h) return;
    setResult({ candidates: h.candidates, topPlans: h.topPlans, errors: [] });
    setCompareIndex(index);
  }

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

          {/* 履歴セレクト */}
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
          <h2 className="text-xl font-bold mb-4">
            Candidates ({result.candidates.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Src</th>
                  <th className="py-2 pr-3">Title / タイトル</th>
                  <th className="py-2 pr-3">Gate</th>
                  <th className="py-2 pr-1 text-center" title="トレース速度">速度</th>
                  <th className="py-2 pr-1 text-center" title="日本需要">需要</th>
                  <th className="py-2 pr-1 text-center" title="日本空白度 (ホバーで競合表示)">空白</th>
                  <th className="py-2 pr-1 text-center" title="リスク低">Risk</th>
                  <th className="py-2 text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {result.candidates.map((c, i) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    rank={i + 1}
                    isNew={previousIds.size > 0 && !previousIds.has(c.id)}
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

function TracePlanCard({ plan, rank }: { plan: MvpPlan; rank: number }) {
  return (
    <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold bg-indigo-600 rounded-full w-6 h-6 flex items-center justify-center">
          {rank}
        </span>
        <h3 className="font-semibold truncate">{plan.title}</h3>
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

function CandidateRow({
  candidate: c,
  rank,
  isNew,
}: {
  candidate: Candidate;
  rank: number;
  isNew: boolean;
}) {
  const { label, color } = SOURCE_BADGE[c.source];
  const competitorText =
    c.jpCompetitors.length > 0
      ? `競合: ${c.jpCompetitors.join(", ")}`
      : "空白市場";

  return (
    <tr className="border-b border-gray-800/50 hover:bg-gray-900/50">
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
      <td className="py-2 pr-3 max-w-md">
        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:underline block truncate"
        >
          {c.title_en}
        </a>
        <span className="text-xs text-gray-500 block truncate">
          {c.title_ja} — {c.desc_ja}
        </span>
      </td>
      <td className="py-2 pr-3">
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${
            c.gate.pass ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-500"
          }`}
          title={c.gate.reason_ja}
        >
          {c.gate.pass ? "PASS" : "FAIL"}
        </span>
      </td>
      <td className="py-2 pr-1 text-center">{c.scores?.traceSpeed.score ?? "-"}</td>
      <td className="py-2 pr-1 text-center">{c.scores?.jpDemand.score ?? "-"}</td>
      <td className="py-2 pr-1 text-center" title={competitorText}>
        <span className="cursor-help">{c.scores?.jpGap.score ?? "-"}</span>
      </td>
      <td className="py-2 pr-1 text-center">{c.scores?.riskLow.score ?? "-"}</td>
      <td className="py-2 text-center font-semibold">
        {c.totalScore > 0 ? c.totalScore : "-"}
      </td>
    </tr>
  );
}
