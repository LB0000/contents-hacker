import OpenAI from "openai";
import { z } from "zod";
import type { Candidate } from "@/lib/types";
import { simulateMarket } from "@/lib/llm/openai";

export const maxDuration = 30;

const SimulateRequestSchema = z.object({
  candidate: z.object({
    id: z.string().min(1),
    title_en: z.string(),
    title_ja: z.string(),
    desc_en: z.string(),
    marketCategory: z.string(),
    jpCompetitors: z.array(z.string()),
    scores: z.object({
      traceSpeed: z.object({ score: z.number(), reason_ja: z.string(), confidence: z.string() }),
      jpDemand: z.object({ score: z.number(), reason_ja: z.string(), confidence: z.string() }),
      jpGap: z.object({ score: z.number(), reason_ja: z.string(), confidence: z.string() }),
      riskLow: z.object({ score: z.number(), reason_ja: z.string(), confidence: z.string() }),
    }).nullable(),
  }),
  userContext: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return Response.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 500 });
    }

    const body = await request.json();
    const parsed = SimulateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "候補データが不正です" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: openaiKey });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

    const simulation = await simulateMarket(
      client,
      parsed.data.candidate as Candidate,
      parsed.data.userContext,
      controller.signal,
    );

    clearTimeout(timeoutId);
    return Response.json({ simulation });
  } catch {
    return Response.json({ error: "シミュレーションに失敗しました" }, { status: 500 });
  }
}
