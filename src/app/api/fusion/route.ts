import OpenAI from "openai";
import { z } from "zod";
import { generateFusions } from "@/lib/llm/openai";
import type { FusionPair } from "@/lib/fusion";

export const maxDuration = 25;

const PairSchema = z.object({
  a: z.object({
    id: z.string(),
    title_en: z.string(),
    title_ja: z.string(),
    desc_ja: z.string(),
    marketCategory: z.string(),
  }),
  b: z.object({
    id: z.string(),
    title_en: z.string(),
    title_ja: z.string(),
    desc_ja: z.string(),
    marketCategory: z.string(),
  }),
});

const FusionRequestSchema = z.object({
  pairs: z.array(PairSchema).min(1).max(8),
  userContext: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 500 });
    }

    const body = await request.json();
    const parsed = FusionRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "リクエストが不正です" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const pairs: FusionPair[] = parsed.data.pairs;

    const { fusions, errors } = await generateFusions(
      client,
      pairs,
      parsed.data.userContext,
    );

    return Response.json({ fusions, errors });
  } catch {
    return Response.json({ error: "融合生成に失敗しました" }, { status: 500 });
  }
}
