"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { RunResult, SourceType } from "@/lib/types";
import { SOURCE_BADGE, WEIGHT_LABELS, WEIGHT_KEYS, WEIGHTS_KEY, type SortKey } from "@/lib/constants";
import { type RunHistory, loadHistory, saveHistory, getPreviousIds } from "@/lib/history";
import { type ScoreWeights, DEFAULT_WEIGHTS, loadWeights, getScoreValue } from "@/lib/scores";
import { type ProgressStep, INITIAL_STEPS, deriveSteps } from "@/lib/progress";
import { downloadMarkdown } from "@/lib/markdown";
import { SortableTh } from "@/components/SortableTh";
import { EmptyState } from "@/components/EmptyState";
import { ErrorPanel } from "@/components/ErrorPanel";
import { TracePlanCard } from "@/components/TracePlanCard";
import { CandidateRow } from "@/components/CandidateRow";
import {
  Play, Loader2, Download, History, Check,
  SlidersHorizontal, RotateCcw, Trophy, LayoutList,
} from "lucide-react";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(INITIAL_STEPS);
  const [result, setResult] = useState<RunResult | null>(null);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [compareIndex, setCompareIndex] = useState(0);

  const [sortKey, setSortKey] = useState<SortKey>("totalScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [gateFilter, setGateFilter] = useState<"all" | "pass" | "fail">("all");
  const [sourceFilter, setSourceFilter] = useState<SourceType | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [showWeights, setShowWeights] = useState(false);
  const [userContext, setUserContext] = useState("");
  const [showFailedTier, setShowFailedTier] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHistory(loadHistory());
    setWeights(loadWeights());
    return () => { abortRef.current?.abort(); };
  }, []);

  const previousIds = getPreviousIds(history, compareIndex);

  const handleRun = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setResult(null);
    setProgress("開始...");
    setProgressSteps(INITIAL_STEPS);
    setExpandedId(null);

    try {
      const timeoutId = setTimeout(() => controller.abort(), 130_000);
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userContext: userContext.trim() || undefined }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
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
              const raw = event.result;
              const data: RunResult = {
                candidates: Array.isArray(raw.candidates) ? raw.candidates : [],
                topPlans: Array.isArray(raw.topPlans) ? raw.topPlans : [],
                errors: Array.isArray(raw.errors) ? raw.errors : [],
              };
              setResult(data);
              setProgressSteps((prev) => prev.map((s) => ({ ...s, status: "done" as const })));
              if (data.candidates.length > 0) {
                saveHistory(data);
                setHistory(loadHistory());
                setCompareIndex(0);
              }
            } else if (event.step === "error") {
              setResult({ candidates: [], topPlans: [], errors: [event.message] });
            } else {
              setProgress(event.message);
              setProgressSteps(deriveSteps(event.step, event.message));
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setResult({
        candidates: [],
        topPlans: [],
        errors: [e instanceof Error ? e.message : "不明なエラーが発生しました"],
      });
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, [userContext]);

  function loadFromHistory(index: number) {
    const h = history[index];
    if (!h) return;
    setResult({ candidates: h.candidates, topPlans: h.topPlans, errors: [] });
    setCompareIndex(index);
    setExpandedId(null);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleWeightChange(key: keyof ScoreWeights, value: number) {
    const next = { ...weights, [key]: value };
    setWeights(next);
    try {
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify(next));
    } catch { /* QuotaExceeded */ }
  }

  function resetWeights() {
    setWeights(DEFAULT_WEIGHTS);
    localStorage.removeItem(WEIGHTS_KEY);
  }

  const isDefaultWeights = WEIGHT_KEYS.every((k) => weights[k] === 1);

  const { tier1, tier2, tier3 } = useMemo(() => {
    if (!result?.candidates) return { tier1: [], tier2: [], tier3: [] };
    let list = result.candidates;

    if (sourceFilter !== "all") list = list.filter((c) => c.source === sourceFilter);
    if (gateFilter === "pass") list = list.filter((c) => c.gate.pass);
    else if (gateFilter === "fail") list = list.filter((c) => !c.gate.pass);

    const sorted = [...list].sort((a, b) => {
      const av = getScoreValue(a, sortKey, weights);
      const bv = getScoreValue(b, sortKey, weights);
      return sortDir === "desc" ? bv - av : av - bv;
    });

    const passed = sorted.filter((c) => c.gate.pass);
    const failed = sorted.filter((c) => !c.gate.pass);

    return { tier1: passed.slice(0, 3), tier2: passed.slice(3), tier3: failed };
  }, [result?.candidates, gateFilter, sourceFilter, sortKey, sortDir, weights]);

  const totalFiltered = tier1.length + tier2.length + tier3.length;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {/* ── Header ── */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-glow">Contents Hacker</h1>
        <p className="text-text-secondary mt-2">
          海外プロダクトを発見 → 日本トレースの可能性を自動評価
        </p>
        <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
          <input
            type="text"
            value={userContext}
            onChange={(e) => setUserContext(e.target.value)}
            placeholder="例: Next.js得意、BtoC、週末だけ"
            disabled={loading}
            aria-label="ユーザーコンテキスト（スキル・関心など）"
            className="px-3 py-2.5 bg-surface-raised border border-border-default rounded-lg text-sm text-text-primary placeholder-text-muted focus:border-primary-light focus:outline-none w-64 disabled:opacity-50 transition-colors duration-150"
          />
          {loading ? (
            <button
              onClick={() => { abortRef.current?.abort(); setLoading(false); setProgress(""); }}
              className="px-6 py-2.5 bg-red-700 hover:bg-red-600 rounded-lg font-medium transition-colors duration-200 cursor-pointer text-white"
            >
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Cancel
              </span>
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="px-6 py-2.5 bg-cta hover:bg-cta-hover rounded-lg font-medium transition-colors duration-200 btn-cta cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Play size={16} />
                Run
              </span>
            </button>
          )}

          {result && result.candidates.length > 0 && (
            <button
              onClick={() => downloadMarkdown(result)}
              className="px-4 py-2.5 bg-surface-overlay hover:bg-surface-hover text-text-secondary rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer flex items-center gap-1.5"
            >
              <Download size={14} />
              Export .md
            </button>
          )}
          {history.length > 0 && (
            <div className="flex items-center gap-1.5">
              <History size={14} className="text-text-muted" />
              <select
                value={compareIndex}
                onChange={(e) => loadFromHistory(Number(e.target.value))}
                className="bg-surface-overlay border border-border-default rounded-lg px-3 py-2 text-sm text-text-secondary cursor-pointer"
              >
                {history.map((h, i) => (
                  <option key={i} value={i}>
                    {i === 0 ? "Latest" : ""} {new Date(h.timestamp).toLocaleString("ja-JP")}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ── Progress Steps ── */}
        {loading && (
          <div className="mt-5 flex items-center justify-center gap-1">
            {progressSteps.map((step, i) => (
              <div key={step.key} className="flex items-center">
                {i > 0 && (
                  <div
                    className={`w-6 h-0.5 mx-0.5 transition-colors duration-200 ${
                      step.status !== "pending" ? "bg-primary-light" : "bg-border-default"
                    }`}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                      step.status === "done"
                        ? "bg-score-high text-white"
                        : step.status === "active"
                        ? "bg-primary text-white ring-2 ring-primary-light ring-offset-1 ring-offset-surface-base animate-pulse"
                        : "bg-surface-overlay text-text-muted"
                    }`}
                  >
                    {step.status === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </div>
                  <span
                    className={`text-[10px] ${
                      step.status === "active" ? "text-primary-light font-medium" : "text-text-muted"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {loading && (
          <p className="mt-2 text-xs text-text-secondary">
            {progress || "開始..."}<span className="text-text-muted ml-2">（通常30〜60秒）</span>
          </p>
        )}
      </div>

      {/* ── Errors ── */}
      {result?.errors && <ErrorPanel errors={result.errors} />}

      {/* ── Trace Plans ── */}
      {result?.topPlans && result.topPlans.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Trophy size={18} className="text-cta" />
            Top 3 トレース計画
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {result.topPlans.map((plan, i) => (
              <div key={plan.id} className={`animate-fade-slide-up ${i === 1 ? "animate-delay-100" : i === 2 ? "animate-delay-200" : ""}`}>
                <TracePlanCard plan={plan} rank={i + 1} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Candidates Table ── */}
      {result?.candidates && result.candidates.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <LayoutList size={18} className="text-primary-light" />
              Candidates ({totalFiltered} / {result.candidates.length})
            </h2>
            <div className="flex gap-2 text-xs">
              {(["all", "pass", "fail"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setGateFilter(v)}
                  className={`px-2 py-1 rounded cursor-pointer transition-colors duration-150 ${
                    gateFilter === v
                      ? "bg-primary text-white"
                      : "bg-surface-overlay text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  {v === "all" ? "ALL" : v.toUpperCase()}
                </button>
              ))}
              <span className="text-border-default">|</span>
              {(["all", "hackernews", "producthunt", "github", "reddit"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSourceFilter(v)}
                  className={`px-2 py-1 rounded cursor-pointer transition-colors duration-150 ${
                    sourceFilter === v
                      ? "bg-primary text-white"
                      : "bg-surface-overlay text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  {v === "all" ? "ALL" : SOURCE_BADGE[v].label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowWeights((v) => !v)}
              className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors duration-150 flex items-center gap-1 ${
                showWeights || !isDefaultWeights
                  ? "bg-primary text-white"
                  : "bg-surface-overlay text-text-secondary hover:bg-surface-hover"
              }`}
            >
              <SlidersHorizontal size={12} />
              重み
            </button>
          </div>

          {/* Weight Sliders */}
          {showWeights && (
            <div className="mb-4 p-3 bg-surface-raised border border-border-default rounded-lg flex items-center gap-4 flex-wrap expand-enter">
              {WEIGHT_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="w-8 text-text-muted">{WEIGHT_LABELS[key]}</span>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.5}
                    value={weights[key]}
                    onChange={(e) => handleWeightChange(key, Number(e.target.value))}
                    className="w-20 accent-primary-light"
                  />
                  <span className="w-6 text-right font-mono">{weights[key].toFixed(1)}</span>
                </label>
              ))}
              {!isDefaultWeights && (
                <button
                  onClick={resetWeights}
                  className="text-[10px] px-2 py-1 rounded bg-surface-overlay text-text-secondary hover:bg-surface-hover cursor-pointer transition-colors duration-150 flex items-center gap-1"
                >
                  <RotateCcw size={10} />
                  リセット
                </button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-default text-left text-text-secondary">
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
                {tier1.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={10} className="pt-2 pb-1 px-1">
                        <span className="text-[10px] font-bold text-tier1-accent uppercase tracking-wider">Tier 1 — 注目</span>
                      </td>
                    </tr>
                    {tier1.map((c, i) => (
                      <CandidateRow
                        key={c.id}
                        candidate={c}
                        rank={i + 1}
                        tier={1}
                        isNew={previousIds.size > 0 && !previousIds.has(c.id)}
                        isExpanded={expandedId === c.id}
                        onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        weights={weights}
                      />
                    ))}
                  </>
                )}
                {tier2.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={10} className="pt-4 pb-1 px-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Tier 2 — 候補 ({tier2.length}件)</span>
                      </td>
                    </tr>
                    {tier2.map((c, i) => (
                      <CandidateRow
                        key={c.id}
                        candidate={c}
                        rank={tier1.length + i + 1}
                        tier={2}
                        isNew={previousIds.size > 0 && !previousIds.has(c.id)}
                        isExpanded={expandedId === c.id}
                        onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        weights={weights}
                      />
                    ))}
                  </>
                )}
                {tier3.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={10} className="pt-4 pb-1 px-1">
                        {gateFilter === "all" ? (
                          <button
                            onClick={() => setShowFailedTier((v) => !v)}
                            className="text-[10px] font-bold text-text-muted uppercase tracking-wider hover:text-text-secondary transition-colors cursor-pointer"
                          >
                            Tier 3 — 参考 ({tier3.length}件) {showFailedTier ? "▲" : "▼"}
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                            Tier 3 — 参考 ({tier3.length}件)
                          </span>
                        )}
                      </td>
                    </tr>
                    {(gateFilter !== "all" || showFailedTier) && tier3.map((c, i) => (
                      <CandidateRow
                        key={c.id}
                        candidate={c}
                        rank={tier1.length + tier2.length + i + 1}
                        tier={3}
                        isNew={previousIds.size > 0 && !previousIds.has(c.id)}
                        isExpanded={expandedId === c.id}
                        onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                        weights={weights}
                      />
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Empty State ── */}
      {!loading && !result && <EmptyState />}
    </main>
  );
}
