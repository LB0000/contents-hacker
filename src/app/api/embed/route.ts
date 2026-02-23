import OpenAI from "openai";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import type { CaseEntry, SimilarCase } from "@/lib/types";
import { findSimilarCases } from "@/lib/vector";

export const maxDuration = 30;

const EmbedRequestSchema = z.object({
  candidates: z.array(z.object({
    id: z.string(),
    title_en: z.string(),
    desc_en: z.string(),
  })).min(1).max(50),
});

let cachedCases: CaseEntry[] | null = null;

function loadCases(): CaseEntry[] {
  if (cachedCases) return cachedCases;
  try {
    const raw = readFileSync(join(process.cwd(), "src/data/cases.json"), "utf-8");
    const data = JSON.parse(raw);
    cachedCases = data.cases ?? [];
    return cachedCases!;
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return Response.json({ error: "OPENAI_API_KEY が未設定です" }, { status: 500 });
    }

    const body = await request.json();
    const parsed = EmbedRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "リクエストが不正です" }, { status: 400 });
    }

    const cases = loadCases();
    const hasEmbeddings = cases.some((c) => c.embedding.length > 0);

    if (!hasEmbeddings) {
      // 事例DBにembeddingがない場合は空結果を返す
      return Response.json({
        results: parsed.data.candidates.map((c) => ({
          candidateId: c.id,
          similarCases: [],
        })),
      });
    }

    const client = new OpenAI({ apiKey: openaiKey });

    // バッチembedding
    const texts = parsed.data.candidates.map((c) => `${c.title_en}: ${c.desc_en.slice(0, 200)}`);
    const embeddingResponse = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
    });

    if (embeddingResponse.data.length !== parsed.data.candidates.length) {
      return Response.json({ error: "embedding結果数が一致しません" }, { status: 500 });
    }

    const results = parsed.data.candidates.map((c, i) => {
      const embedding = embeddingResponse.data[i].embedding;
      const similarCases = findSimilarCases(embedding, cases, 3);
      return {
        candidateId: c.id,
        similarCases,
      };
    });

    return Response.json({ results });
  } catch {
    return Response.json({ error: "embedding処理に失敗しました" }, { status: 500 });
  }
}
