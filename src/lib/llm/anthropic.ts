import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { NormalizedItem, Candidate, MvpPlan } from "../types";
import { EvalItemSchema, MvpPlansResponseSchema, EvalItem } from "./schemas";

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

// ---------- 乗算スコア計算 ----------

/** jpDemand × jpGap が前提条件。ゼロならゼロ。 */
export function calcTotalScore(jpDemand: number, jpGap: number, traceSpeed: number, riskLow: number): number {
  const market = jpDemand * jpGap;
  if (market === 0) return 0;
  return market + traceSpeed + riskLow;
}

// ---------- 評価プロンプト生成 ----------

function buildEvalPrompt(itemCount: number, inputJson: string, userContext?: string): string {
  const userContextBlock = userContext
    ? `\n\n評価者のプロフィール（このコンテキストを考慮してスコアを調整してください）:\n${userContext}`
    : "";

  return `あなたは海外プロダクトの日本トレース（ローカライズ再現）の専門家です。
以下の${itemCount}件のプロダクト/トピックを「個人開発者が日本市場向けにバイブコーディングで最速トレースできるか」の観点で評価してください。

各アイテムについて:
1. title_ja: タイトルの日本語訳
2. desc_ja: 説明の日本語要約（1文）
3. gate: { pass: boolean, reason_ja: string }
   - PASS: Webアプリ/SaaSとして個人開発でトレース可能 & 日本で未展開 or 弱い
   - FAIL: 純粋なニュース/意見記事、日本で大手が展開済み、ハードウェア依存、規制が厳しい、トレース不可能
   Examples:
   - PASS: "CalSync - Calendar sharing tool for teams" → Web SaaS, 日本に強い競合なし, 数日で構築可能
   - FAIL: "Why AI will replace developers" → 意見記事であり、プロダクトではない
   - FAIL: "Notion AI updates" → Notionは日本で大手が展開済み
4. scores (gate.pass=true のみ、falseならnull):
   各スコアには confidence ("high"|"medium"|"low") を付けてください。
   confidence基準: high=具体的根拠あり, medium=推測だが蓋然性あり, low=判断材料が不足
   - traceSpeed: { score: 0-5, reason_ja, confidence } — トレース速度: バイブコーディングで何日で日本版MVPを作れるか (5=1-3日, 4=1週間, 3=2週間, 2=1ヶ月, 1=数ヶ月, 0=不可能). 前提: Next.js + Stripe + Vercel, TypeScript, 開発者1名.
   - jpDemand: { score: 0-5, reason_ja, confidence } — 日本需要: 日本市場に同等の課題・ニーズがあるか (5=明確に大きい, 0=需要なし)
   - jpGap: { score: 0-5, reason_ja, confidence } — 日本空白度: 日本に同様のサービスが存在しないか (5=完全空白, 3=弱い競合あり, 0=大手が展開済み)。jpCompetitors の内容を根拠にスコアを判定すること。
   - riskLow: { score: 0-5, reason_ja, confidence } — リスク低: 法規制・API依存・技術的リスクが低いか (5=リスクなし, 0=高リスク)
5. jpCompetitors: string[] — 日本で同様のサービスを提供している既知の競合を最大3つ列挙。なければ空配列。確信がある場合のみ列挙し、推測や存在が不確かなサービスは含めないこと。
6. marketCategory: string — このプロダクトの市場カテゴリ。入力の hintCategory を参考にしつつ、以下から最も適切な1つを選択:
   - "ai-tool": AI系ツール（LLMラッパー、AI SaaS、AIエージェント）
   - "ec-optimize": EC最適化（決済、物流、在庫、商品管理）
   - "analog-dx": アナログ業界DX（建設、不動産、飲食、農業、医療等のデジタル化）
   - "info-gap-ai": 情報格差×AI（非技術者向けAI、ノーコード、中小企業向け）
   - "marketplace": マーケットプレイス（マッチング、C2C、フリーランス）
   - "vertical-saas": バーティカルSaaS（業界特化B2Bツール、HR、会計、法務）
   - "devtool": 開発ツール（SDK、API、CLI、インフラ、CI/CD）
   - "other": 上記に当てはまらないもの

JSON配列のみ返してください（マークダウンフェンス不要）:
[{"index":0,"title_ja":"...","desc_ja":"...","gate":{"pass":true,"reason_ja":"..."},"scores":{"traceSpeed":{"score":4,"reason_ja":"...","confidence":"high"},"jpDemand":{"score":3,"reason_ja":"...","confidence":"medium"},"jpGap":{"score":5,"reason_ja":"...","confidence":"high"},"riskLow":{"score":4,"reason_ja":"...","confidence":"high"}},"jpCompetitors":["サービスA","サービスB"],"marketCategory":"ec-optimize"}]
${userContextBlock}
Items:
${inputJson}`;
}

// ---------- 1回目: 翻訳 + 関門 + 採点 + 競合チェック (2バッチ並列) ----------

export async function evaluateAll(
  client: Anthropic,
  items: NormalizedItem[],
  userContext?: string
): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const mid = Math.ceil(items.length / 2);
  const batch1 = items.slice(0, mid);
  const batch2 = items.slice(mid);

  const [result1, result2] = await Promise.all([
    evaluateBatch(client, batch1, 0, userContext),
    evaluateBatch(client, batch2, mid, userContext),
  ]);

  const errors = [...result1.errors, ...result2.errors];
  const candidates = [...result1.candidates, ...result2.candidates];

  // D2: 評価失敗率の検出
  const fallbackCount = candidates.filter(
    (c) => c.gate.reason_ja === "評価に失敗しました"
  ).length;
  if (items.length > 0 && fallbackCount / items.length > 0.2) {
    errors.push(
      `評価失敗率が高い: ${fallbackCount}/${items.length}件 (${Math.round((fallbackCount / items.length) * 100)}%)。結果の信頼性が低い可能性があります。`
    );
  }

  return { candidates, errors };
}

async function evaluateBatch(
  client: Anthropic,
  items: NormalizedItem[],
  indexOffset: number,
  userContext?: string
): Promise<{ candidates: Candidate[]; errors: string[] }> {
  const errors: string[] = [];
  if (items.length === 0) return { candidates: [], errors };

  const input = items.map((it, i) => ({
    index: i + indexOffset,
    title_en: it.title_en,
    desc_en: it.desc_en.slice(0, 200),
    tags: it.tags.slice(0, 8),
    source: it.source,
    hintCategory: it.marketCategory,
  }));

  const prompt = buildEvalPrompt(items.length, JSON.stringify(input), userContext);
  const message = await callClaude(client, prompt, 4096);
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: EvalItem[] = [];
  try {
    const raw = JSON.parse(extractJson(text));
    if (!Array.isArray(raw)) throw new Error("LLM response is not an array");

    let failCount = 0;
    for (const item of raw) {
      const result = EvalItemSchema.safeParse(item);
      if (result.success) {
        parsed.push(result.data);
      } else {
        failCount++;
      }
    }
    if (failCount > 0) {
      errors.push(`${raw.length}件中${failCount}件のバリデーション失敗（フォールバック適用）`);
    }
  } catch (e) {
    errors.push(`LLM JSON検証エラー: ${e instanceof Error ? e.message : String(e)}`);
    return {
      candidates: items.map((it) => fallbackCandidate(it)),
      errors,
    };
  }

  const candidates: Candidate[] = items.map((it, i) => {
    const ev = parsed.find((p) => p.index === i + indexOffset);
    if (!ev) return fallbackCandidate(it);

    const scores = ev.scores;
    const totalScore = scores
      ? calcTotalScore(scores.jpDemand.score, scores.jpGap.score, scores.traceSpeed.score, scores.riskLow.score)
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
      deepDived: false,
      marketCategory: ev.marketCategory ?? it.marketCategory,
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
    deepDived: false,
    marketCategory: it.marketCategory,
  };
}

// ---------- 1.5回目: confidence=low の候補を深掘り ----------

const DeepDiveItemSchema = z.object({
  id: z.string(),
  jpDemand: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]) }),
  jpGap: z.object({ score: z.number().min(0).max(5), reason_ja: z.string(), confidence: z.enum(["high", "medium", "low"]) }),
});

type DeepDiveItem = z.infer<typeof DeepDiveItemSchema>;

/** confidence=low の PASS 候補だけ再評価し、スコアを更新して返す */
export async function deepDiveEval(
  client: Anthropic,
  candidates: Candidate[],
  userContext?: string
): Promise<{ updated: Candidate[]; deepDivedCount: number; errors: string[] }> {
  const errors: string[] = [];

  // 対象: gate.pass=true かつ jpDemand or jpGap の confidence="low"
  const targets = candidates.filter(
    (c) =>
      c.gate.pass &&
      c.scores &&
      (c.scores.jpDemand.confidence === "low" || c.scores.jpGap.confidence === "low")
  );

  if (targets.length === 0) {
    return { updated: candidates, deepDivedCount: 0, errors };
  }

  const input = targets.map((c) => ({
    id: c.id,
    title_en: c.title_en,
    title_ja: c.title_ja,
    desc_en: c.desc_en.slice(0, 200),
    current_jpDemand: c.scores!.jpDemand.score,
    current_jpGap: c.scores!.jpGap.score,
    jpCompetitors: c.jpCompetitors,
  }));

  const userContextBlock = userContext
    ? `\n\n評価者のプロフィール:\n${userContext}`
    : "";

  const prompt = `あなたは海外プロダクトの日本トレース（ローカライズ再現）の専門家です。
以下の${targets.length}件は初回評価で確信度が低かったプロダクトです。より深い分析をお願いします。

各プロダクトについて以下の観点で再考してください:
- 日本で類似の課題を持つ具体的な職種・業界は？
- その人が今どうやって解決しているか？（既存の代替手段）
- 既存の解決策の不満点は何か？
- 日本特有の商習慣で需要が変わる要素は？

上記を踏まえて jpDemand と jpGap のスコアを再評価してください。

JSON配列のみ返してください:
[{"id":"元のid","jpDemand":{"score":3,"reason_ja":"再評価の根拠...","confidence":"high"},"jpGap":{"score":4,"reason_ja":"再評価の根拠...","confidence":"high"}}]
${userContextBlock}
Items:
${JSON.stringify(input)}`;

  try {
    const message = await callClaude(client, prompt, 2048);
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const raw = JSON.parse(extractJson(text));
    if (!Array.isArray(raw)) throw new Error("Deep dive response is not an array");

    const parsed: DeepDiveItem[] = [];
    for (const item of raw) {
      const result = DeepDiveItemSchema.safeParse(item);
      if (result.success) parsed.push(result.data);
    }

    // 元の candidates を更新
    const updateMap = new Map(parsed.map((p) => [p.id, p]));
    const updated = candidates.map((c) => {
      const dd = updateMap.get(c.id);
      if (!dd || !c.scores) return c;

      const newScores = {
        ...c.scores,
        jpDemand: dd.jpDemand,
        jpGap: dd.jpGap,
      };
      return {
        ...c,
        scores: newScores,
        totalScore: calcTotalScore(dd.jpDemand.score, dd.jpGap.score, newScores.traceSpeed.score, newScores.riskLow.score),
        deepDived: true,
      };
    });

    return { updated, deepDivedCount: targets.length, errors };
  } catch (e) {
    errors.push(`深掘り評価エラー: ${e instanceof Error ? e.message : String(e)}`);
    return { updated: candidates, deepDivedCount: 0, errors };
  }
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
以下の上位${top3.length}件について、個人開発者がバイブコーディングで日本版を最速ローンチするための具体的な計画を作成してください。

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
