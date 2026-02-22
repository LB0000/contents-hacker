import OpenAI from "openai";
import { z } from "zod";
import type { Candidate } from "@/lib/types";
import { deepDiveEval } from "@/lib/llm/openai";

export const maxDuration = 30;

/** Minimal Zod schema to validate incoming candidate from the client */
const DeepDiveRequestSchema = z.object({
  candidate: z.object({
    id: z.string().min(1),
    source: z.enum(["producthunt", "hackernews", "github", "reddit", "indiehackers", "betalist"]),
    title_en: z.string(),
    desc_en: z.string(),
    title_ja: z.string(),
    desc_ja: z.string(),
    url: z.string().url(),
    tags: z.array(z.string()),
    publishedAt: z.string(),
    sourceScore: z.number().nullable(),
    gate: z.object({
      result: z.enum(["pass", "maybe", "fail"]),
      reason_ja: z.string(),
    }),
    scores: z.object({
      traceSpeed: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]) }),
      jpDemand: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]) }),
      jpGap: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]) }),
      riskLow: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]) }),
    }).nullable(),
    totalScore: z.number(),
    jpCompetitors: z.array(z.string()),
    deepDived: z.boolean(),
    marketCategory: z.string(),
    overseasPopularity: z.number(),
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
    const parsed = DeepDiveRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "候補データが不正です" }, { status: 400 });
    }

    const candidate = parsed.data.candidate as Candidate;
    const userContext = parsed.data.userContext;

    if (candidate.gate.result === "fail") {
      return Response.json({ error: "FAIL候補は深掘りできません" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: openaiKey });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25_000);

    const { updated, errors } = await deepDiveEval(
      client,
      [candidate],
      userContext,
      controller.signal
    );

    clearTimeout(timeoutId);

    if (errors.length > 0) {
      return Response.json({ error: errors[0] }, { status: 500 });
    }

    return Response.json({ candidate: updated[0] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
