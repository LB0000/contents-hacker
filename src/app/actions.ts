"use server";

import Anthropic from "@anthropic-ai/sdk";
import { RunResult, NormalizedItem } from "@/lib/types";
import { fetchHackerNews } from "@/lib/sources/hackernews";
import { fetchProductHunt } from "@/lib/sources/producthunt";
import { fetchGitHub } from "@/lib/sources/github";
import { fetchReddit } from "@/lib/sources/reddit";
import { deduplicateAndTrim, needsMoreItems } from "@/lib/normalize";
import { evaluateAll, generateMvpPlans } from "@/lib/llm/anthropic";
import { pickTop3 } from "@/lib/scoring";

type Fetcher = (limit: number) => Promise<NormalizedItem[]>;

const SOURCES: { name: string; fetch: Fetcher }[] = [
  { name: "Hacker News", fetch: fetchHackerNews },
  { name: "Product Hunt", fetch: fetchProductHunt },
  { name: "GitHub Trending", fetch: fetchGitHub },
  { name: "Reddit r/SaaS", fetch: fetchReddit },
];

export async function runAction(): Promise<RunResult> {
  const errors: string[] = [];

  // 1. 環境変数チェック
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return { candidates: [], topPlans: [], errors: ["ANTHROPIC_API_KEY が未設定です。.env.local に設定してください。"] };
  }
  const client = new Anthropic({ apiKey: anthropicKey });

  // 2. ソース取得 (初回 N=60, 不足なら N=120)
  let trimmed: NormalizedItem[] = [];

  for (const limit of [60, 120]) {
    const fetchErrors: string[] = [];
    const results = await Promise.allSettled(
      SOURCES.map((s) => s.fetch(limit))
    );

    const items: NormalizedItem[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        items.push(...r.value);
      } else {
        fetchErrors.push(`${SOURCES[i].name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      }
    });

    if (items.length === 0) {
      errors.push(...fetchErrors);
      return { candidates: [], topPlans: [], errors: [...errors, "取得できたアイテムが0件です"] };
    }

    // 3. 正規化・重複排除・30件固定
    trimmed = deduplicateAndTrim(items);

    if (!needsMoreItems(trimmed.length)) {
      errors.push(...fetchErrors);
      break;
    }
    // 不足時はリトライするのでエラーは次のループで上書き
  }

  // 4. Claude で翻訳 + 関門 + 採点 + 競合チェック (1回目)
  const { candidates, errors: evalErrors } = await evaluateAll(client, trimmed);
  errors.push(...evalErrors);

  // totalScore でソート
  candidates.sort((a, b) => b.totalScore - a.totalScore);

  // 5. 上位3件のトレース計画 (2回目)
  const top3 = pickTop3(candidates);
  let topPlans = [];

  if (top3.length > 0) {
    const { plans, errors: planErrors } = await generateMvpPlans(client, top3);
    topPlans = plans;
    errors.push(...planErrors);
  }

  return { candidates, topPlans, errors };
}
