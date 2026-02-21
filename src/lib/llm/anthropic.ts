import Anthropic from "@anthropic-ai/sdk";
import { NormalizedItem, Candidate, MvpPlan } from "../types";
import { EvalResponseSchema, MvpPlansResponseSchema, EvalItem } from "./schemas";

function extractJson(text: string): string {
  // まずJSON配列の開始/終了位置を探す
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  // フォールバック: マークダウンフェンス除去
  return text.replace(/^```json?\n?/m, "").replace(/\n?```$/m, "").trim();
}

function callClaude(client: Anthropic, prompt: string, maxTokens: number) {
  return client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
}

// ---------- 1回目: 翻訳 + 関門 + 採点 + 競合チェック ----------

export async function evaluateAll(
  client: Anthropic,
  items: NormalizedItem[]
): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const errors: string[] = [];

  const input = items.map((it, i) => ({
    index: i,
    title_en: it.title_en,
    desc_en: it.desc_en.slice(0, 200),
    tags: it.tags.slice(0, 8),
    source: it.source,
  }));

  const prompt = `あなたは海外プロダクトの日本トレース（ローカライズ再現）の専門家です。
以下の${items.length}件のプロダクト/トピックを「個人開発者が日本市場向けにバイブコーディングで最速トレースできるか」の観点で評価してください。

各アイテムについて:
1. title_ja: タイトルの日本語訳
2. desc_ja: 説明の日本語要約（1文）
3. gate: { pass: boolean, reason_ja: string }
   - PASS: Webアプリ/SaaSとして個人開発でトレース可能 & 日本で未展開 or 弱い
   - FAIL: 純粋なニュース/意見記事、日本で大手が展開済み、ハードウェア依存、規制が厳しい、トレース不可能
4. scores (gate.pass=true のみ、falseならnull):
   - traceSpeed: { score: 0-5, reason_ja } — トレース速度: バイブコーディングで何日で日本版MVPを作れるか (5=1-3日, 4=1週間, 3=2週間, 2=1ヶ月, 1=数ヶ月, 0=不可能)
   - jpDemand: { score: 0-5, reason_ja } — 日本需要: 日本市場に同等の課題・ニーズがあるか (5=明確に大きい, 0=需要なし)
   - jpGap: { score: 0-5, reason_ja } — 日本空白度: 日本に同様のサービスが存在しないか (5=完全空白, 3=弱い競合あり, 0=大手が展開済み)。jpCompetitors の内容を根拠にスコアを判定すること。
   - riskLow: { score: 0-5, reason_ja } — リスク低: 法規制・API依存・技術的リスクが低いか (5=リスクなし, 0=高リスク)
5. jpCompetitors: string[] — 日本で同様のサービスを提供している既知の競合を最大3つ列挙。なければ空配列。

JSON配列のみ返してください（マークダウンフェンス不要）:
[{"index":0,"title_ja":"...","desc_ja":"...","gate":{"pass":true,"reason_ja":"..."},"scores":{"traceSpeed":{"score":4,"reason_ja":"..."},"jpDemand":{"score":3,"reason_ja":"..."},"jpGap":{"score":5,"reason_ja":"..."},"riskLow":{"score":4,"reason_ja":"..."}},"jpCompetitors":["サービスA","サービスB"]}]

Items:
${JSON.stringify(input)}`;

  const message = await callClaude(client, prompt, 8192);
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: EvalItem[];
  try {
    const raw = JSON.parse(extractJson(text));
    parsed = EvalResponseSchema.parse(raw);
  } catch (e) {
    errors.push(`LLM JSON検証エラー: ${e instanceof Error ? e.message : String(e)}`);
    return {
      candidates: items.map((it) => fallbackCandidate(it)),
      errors,
    };
  }

  const candidates: Candidate[] = items.map((it, i) => {
    const ev = parsed.find((p) => p.index === i);
    if (!ev) return fallbackCandidate(it);

    const scores = ev.scores;
    const totalScore = scores
      ? scores.traceSpeed.score + scores.jpDemand.score + scores.jpGap.score + scores.riskLow.score
      : 0;

    return {
      id: it.id,
      source: it.source,
      title_en: it.title_en,
      desc_en: it.desc_en,
      title_ja: ev.title_ja,
      desc_ja: ev.desc_ja,
      url: it.url,
      tags: it.tags,
      publishedAt: it.publishedAt,
      sourceScore: it.sourceScore,
      gate: ev.gate,
      scores,
      totalScore,
      jpCompetitors: ev.jpCompetitors,
    };
  });

  return { candidates, errors };
}

function fallbackCandidate(it: NormalizedItem): Candidate {
  return {
    id: it.id,
    source: it.source,
    title_en: it.title_en,
    desc_en: it.desc_en,
    title_ja: it.title_en,
    desc_ja: it.desc_en,
    url: it.url,
    tags: it.tags,
    publishedAt: it.publishedAt,
    sourceScore: it.sourceScore,
    gate: { pass: false, reason_ja: "評価に失敗しました" },
    scores: null,
    totalScore: 0,
    jpCompetitors: [],
  };
}

// ---------- 2回目: 上位3件のトレース計画 ----------

export async function generateMvpPlans(
  client: Anthropic,
  top3: Candidate[]
): Promise<{ plans: MvpPlan[]; errors: string[] }> {
  const errors: string[] = [];

  const input = top3.map((c) => ({
    id: c.id,
    title: c.title_en,
    desc: c.desc_en.slice(0, 200),
    url: c.url,
    source: c.source,
    totalScore: c.totalScore,
    jpCompetitors: c.jpCompetitors,
  }));

  const prompt = `あなたは海外プロダクトの日本トレース（ローカライズ再現）の専門家です。
以下の上位3件について、個人開発者がバイブコーディングで日本版を最速ローンチするための具体的な計画を作成してください。

JSON配列のみ返してください（マークダウンフェンス不要）:
[{
  "id": "元のid",
  "title": "日本版のプロダクト名案",
  "originalUrl": "元プロダクトのURL",
  "jpTarget": "日本でのターゲットユーザー（具体的に）",
  "localization": "ローカライズのポイント（決済=Stripe JP、言語、文化適応、日本特有の商習慣への対応）",
  "techApproach": "バイブコーディングでの実装方針（推奨スタック、使うべきAPI/ライブラリ）",
  "launchPlan": "最速ローンチまでのステップと日数目安（例: Day1-2: LP作成, Day3-5: MVP実装, Day6-7: テスト＆公開）",
  "monetization": "日本向けマネタイズ案（価格帯、課金モデル、フリーミアム設計）"
}]

Topics:
${JSON.stringify(input)}`;

  const message = await callClaude(client, prompt, 3072);
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    const raw = JSON.parse(extractJson(text));
    const plans = MvpPlansResponseSchema.parse(raw);
    return { plans, errors };
  } catch (e) {
    errors.push(`トレース計画 JSON検証エラー: ${e instanceof Error ? e.message : String(e)}`);
    return { plans: [], errors };
  }
}
