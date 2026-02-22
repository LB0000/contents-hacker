import OpenAI from "openai";
import { NormalizedItem, MvpPlan } from "@/lib/types";
import { fetchHackerNews } from "@/lib/sources/hackernews";
import { fetchProductHunt } from "@/lib/sources/producthunt";
import { fetchGitHub } from "@/lib/sources/github";
import { fetchReddit } from "@/lib/sources/reddit";
import { deduplicateAndTrim, needsMoreItems } from "@/lib/normalize";
import { evaluateAll, generateMvpPlans, deepDiveEval } from "@/lib/llm/openai";
import { pickTop3 } from "@/lib/scoring";
import { cached, isCached } from "@/lib/sources/cache";

export const maxDuration = 120;

type Fetcher = (limit: number) => Promise<NormalizedItem[]>;

const SOURCES: { name: string; fetch: Fetcher }[] = [
  { name: "Hacker News", fetch: fetchHackerNews },
  { name: "Product Hunt", fetch: fetchProductHunt },
  { name: "GitHub Trending", fetch: fetchGitHub },
  { name: "Reddit r/SaaS", fetch: fetchReddit },
];

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  // クライアント切断時にLLM呼出を停止するための内部AbortController
  const internal = new AbortController();
  request.signal.addEventListener("abort", () => internal.abort(), { once: true });

  const stream = new ReadableStream({
    async start(controller) {
      const signal = internal.signal;
      const send = (step: string, message: string, extra?: Record<string, unknown>) => {
        if (signal.aborted) return;
        controller.enqueue(encoder.encode(sseEvent({ step, message, ...extra })));
      };

      try {
        // 0. リクエストボディからユーザーコンテキストを取得
        let userContext: string | undefined;
        try {
          const body = await request.json();
          if (body?.userContext && typeof body.userContext === "string" && body.userContext.trim()) {
            userContext = body.userContext.trim();
          }
        } catch {
          // body が空でも問題なし
        }

        // 1. 環境変数チェック
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
          send("error", "OPENAI_API_KEY が未設定です。.env.local に設定してください。");
          return;
        }
        const client = new OpenAI({ apiKey: openaiKey });
        const errors: string[] = [];

        // 2. ソース取得
        const allCached = SOURCES.every((s) => isCached(`${s.name}-60`));
        send("fetch", allCached ? "4ソースから取得中... (キャッシュ)" : "4ソースから取得中...");

        let trimmed: NormalizedItem[] = [];
        for (const limit of [60, 120]) {
          if (signal.aborted) return;

          const fetchErrors: string[] = [];
          const results = await Promise.allSettled(
            SOURCES.map((s) => cached(`${s.name}-${limit}`, () => s.fetch(limit)))
          );

          const items: NormalizedItem[] = [];
          const SHORT_NAMES: Record<string, string> = {
            "Hacker News": "HN", "Product Hunt": "PH",
            "GitHub Trending": "GH", "Reddit r/SaaS": "RD",
          };
          const statusParts: string[] = [];
          results.forEach((r, i) => {
            const short = SHORT_NAMES[SOURCES[i].name] ?? SOURCES[i].name;
            if (r.status === "fulfilled") {
              items.push(...r.value);
              statusParts.push(`${short}: ${r.value.length}件`);
            } else {
              const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
              const statusMatch = errMsg.match(/(\d{3})/);
              statusParts.push(`${short}: \u2717 ${statusMatch?.[1] ?? "failed"}`);
              fetchErrors.push(`${SOURCES[i].name}: ${errMsg}`);
            }
          });
          send("fetch_source_status", statusParts.join(", "));

          if (items.length === 0) {
            errors.push(...fetchErrors);
            send("done", "完了", {
              result: { candidates: [], topPlans: [], errors: [...errors, "取得できたアイテムが0件です"] },
            });
            return;
          }

          trimmed = deduplicateAndTrim(items);

          if (!needsMoreItems(trimmed.length)) {
            errors.push(...fetchErrors);
            break;
          }
        }

        if (signal.aborted) return;
        send("fetch_done", `${trimmed.length}件に圧縮完了`);

        // 3. LLM 評価
        send("eval", `LLM で評価中 (${trimmed.length}件)...`);

        const { candidates: evalCandidates, errors: evalErrors } = await evaluateAll(client, trimmed, userContext, signal);
        errors.push(...evalErrors);

        if (signal.aborted) return;

        let candidates = evalCandidates;
        const passCount = candidates.filter((c) => c.gate.pass).length;

        send("eval_done", `評価完了 — PASS: ${passCount}件 / FAIL: ${candidates.length - passCount}件`);

        // 3.5 確信度の低い候補を深掘り
        if (!signal.aborted) {
          const lowConfCount = candidates.filter(
            (c) => c.gate.pass && c.scores &&
            (c.scores.jpDemand.confidence === "low" || c.scores.jpGap.confidence === "low")
          ).length;

          if (lowConfCount > 0) {
            send("deepdive", `確信度の低い候補を深掘り中 (${lowConfCount}件)...`);
            const { updated, errors: ddErrors } = await deepDiveEval(client, candidates, userContext, signal);
            candidates = updated;
            errors.push(...ddErrors);
            if (!signal.aborted) {
              send("deepdive_done", `深掘り完了 (${lowConfCount}件)`);
            }
          } else {
            send("deepdive_done", "深掘り対象なし（スキップ）");
          }
        }

        if (signal.aborted) return;

        candidates.sort((a, b) => b.totalScore - a.totalScore);

        // 4. トレース計画
        const top3 = pickTop3(candidates);
        let topPlans: MvpPlan[] = [];

        if (top3.length > 0 && !signal.aborted) {
          send("plan", "上位3件のトレース計画を生成中...");
          const { plans, errors: planErrors } = await generateMvpPlans(client, top3, signal);
          topPlans = plans;
          errors.push(...planErrors);
        }

        // 5. 完了
        send("done", "完了", {
          result: { candidates, topPlans, errors },
        });
      } catch (e) {
        if (signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(sseEvent({
          step: "done",
          message: "エラー",
          result: { candidates: [], topPlans: [], errors: [msg] },
        })));
      } finally {
        controller.close();
      }
    },
    cancel() {
      internal.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
