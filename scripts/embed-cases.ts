/**
 * 事例DBのembeddingを一括生成するスクリプト
 * 実行: OPENAI_API_KEY=sk-... npx tsx scripts/embed-cases.ts
 */
import OpenAI from "openai";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const CASES_PATH = join(__dirname, "../src/data/cases.json");
const MODEL = "text-embedding-3-small";

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY が未設定です");
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });
  const data = JSON.parse(readFileSync(CASES_PATH, "utf-8"));
  const cases = data.cases as Array<{
    id: string;
    originalProduct: string;
    summary: string;
    embedding: number[];
  }>;

  console.log(`${cases.length}件の事例をembedding生成中...`);

  // バッチembedding（最大2048件/回）
  const texts = cases.map((c) => `${c.originalProduct}: ${c.summary}`);
  const response = await client.embeddings.create({
    model: MODEL,
    input: texts,
  });

  for (let i = 0; i < cases.length; i++) {
    cases[i].embedding = response.data[i].embedding;
  }

  data.modelVersion = MODEL;
  writeFileSync(CASES_PATH, JSON.stringify(data, null, 2));
  console.log(`完了: ${cases.length}件のembeddingを生成しました`);
  console.log(`Embedding次元: ${cases[0].embedding.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
