"use client";

import { useState } from "react";
import type { MvpPlan } from "@/lib/types";
import { planToMarkdown } from "@/lib/markdown";
import { Copy, ClipboardCheck } from "lucide-react";

export function TracePlanCard({ plan, rank }: { plan: MvpPlan; rank: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(planToMarkdown(plan, rank));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable
    }
  };

  return (
    <div className="p-4 bg-surface-raised border border-border-default rounded-lg hover:border-border-hover transition-colors duration-200">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold bg-primary rounded-full w-6 h-6 flex items-center justify-center">
          {rank}
        </span>
        <h3 className="font-semibold truncate flex-1">{plan.title}</h3>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded bg-surface-overlay text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors duration-150 shrink-0"
          title="Markdownでコピー"
        >
          {copied ? <ClipboardCheck size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <dl className="text-xs text-text-secondary space-y-2">
        {[
          { label: "元プロダクト", value: <a href={plan.originalUrl} target="_blank" rel="noopener noreferrer" className="text-primary-light hover:underline break-all">{plan.originalUrl}</a> },
          { label: "日本ターゲット", value: plan.jpTarget },
          { label: "ローカライズ", value: plan.localization },
          { label: "技術アプローチ", value: plan.techApproach },
          { label: "ローンチ計画", value: <span className="whitespace-pre-line">{plan.launchPlan}</span> },
          { label: "マネタイズ", value: plan.monetization },
        ].map(({ label, value }) => (
          <div key={label}>
            <dt className="text-text-muted font-medium">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
