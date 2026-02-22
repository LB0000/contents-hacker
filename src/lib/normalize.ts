import { NormalizedItem } from "./types";
import { classifyByKeywords, type MarketCategory } from "./categories";

const TARGET = 30;
const MIN_PER_CATEGORY = 2;
const MAX_AI_TOOL = 10;

// ソース優先順位: HN > GH > PH > RD (スコア情報が豊富な順)
const SOURCE_PRIORITY: Record<string, number> = {
  hackernews: 4,
  github: 3,
  producthunt: 2,
  reddit: 1,
};

/**
 * URL重複排除して多様性を考慮しつつ rankScore 降順で30件に固定する。
 * 優先順位の高いソースを残し、低い方のtagsをマージする。
 */
export function deduplicateAndTrim(items: NormalizedItem[]): NormalizedItem[] {
  const byUrl = new Map<string, NormalizedItem>();

  for (const item of items) {
    let key: string;
    try {
      const u = new URL(item.url);
      u.hash = "";
      u.searchParams.delete("utm_source");
      u.searchParams.delete("utm_medium");
      u.searchParams.delete("utm_campaign");
      key = u.origin + u.pathname.replace(/\/$/, "") + u.search;
    } catch {
      key = item.url.replace(/\/$/, "").toLowerCase();
    }
    const existing = byUrl.get(key);

    if (!existing) {
      byUrl.set(key, item);
    } else {
      const existingPri = SOURCE_PRIORITY[existing.source] ?? 0;
      const itemPri = SOURCE_PRIORITY[item.source] ?? 0;
      const merged = new Set([...existing.tags, ...item.tags]);

      if (itemPri > existingPri) {
        // 新しい方が優先度高い → 上書き、タグはマージ
        byUrl.set(key, { ...item, tags: [...merged] });
      } else {
        // 既存を維持、タグだけマージ
        byUrl.set(key, { ...existing, tags: [...merged] });
      }
    }
  }

  const deduped = [...byUrl.values()];

  // ソース別に正規化スコア（0-1）を算出してからソート
  // sourceScore のスケールが異なる（GH星数 vs HN/RD投票数 vs PH null）ため
  const bySource = new Map<string, NormalizedItem[]>();
  for (const item of deduped) {
    const list = bySource.get(item.source) ?? [];
    list.push(item);
    bySource.set(item.source, list);
  }

  const normalizedScore = new Map<string, number>();
  for (const [, items] of bySource) {
    const scores = items.map((it) => it.sourceScore ?? 0);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const range = max - min || 1;
    for (const it of items) {
      normalizedScore.set(it.id, ((it.sourceScore ?? 0) - min) / range);
    }
  }

  // キーワードヒューリスティックで市場カテゴリを付与
  for (const item of deduped) {
    item.marketCategory = classifyByKeywords(item);
  }

  // 多様性を考慮した30件選定
  return diverseSelect(deduped, normalizedScore);
}

/**
 * カテゴリの多様性を保ちつつスコア上位を選ぶ。
 * 1. 予約フェーズ: 各非空カテゴリからスコア上位 MIN_PER_CATEGORY 件を確保
 * 2. 充填フェーズ: 残り枠をスコア順で埋める（AI上限 MAX_AI_TOOL を守る）
 * 3. 緩和フェーズ: まだ TARGET 未満なら上限を解除して埋める
 */
function diverseSelect(
  items: NormalizedItem[],
  normalizedScore: Map<string, number>,
): NormalizedItem[] {
  const scored = items.map((item) => ({
    item,
    normScore: normalizedScore.get(item.id) ?? 0,
  }));

  // カテゴリ別にグループ化し、各グループをスコア降順でソート
  const byCategory = new Map<MarketCategory, typeof scored>();
  for (const entry of scored) {
    const cat = entry.item.marketCategory;
    const list = byCategory.get(cat) ?? [];
    list.push(entry);
    byCategory.set(cat, list);
  }
  for (const [, list] of byCategory) {
    list.sort((a, b) => b.normScore - a.normScore);
  }

  const selected = new Set<string>();
  const result: NormalizedItem[] = [];
  let aiCount = 0;

  // 予約フェーズ: 各カテゴリから MIN_PER_CATEGORY 件
  for (const [cat, list] of byCategory) {
    let taken = 0;
    for (const entry of list) {
      if (taken >= MIN_PER_CATEGORY) break;
      if (selected.has(entry.item.id)) continue;
      if (cat === "ai-tool" && aiCount >= MAX_AI_TOOL) break;
      selected.add(entry.item.id);
      result.push(entry.item);
      if (cat === "ai-tool") aiCount++;
      taken++;
    }
  }

  // 充填フェーズ: 残り枠をスコア順で埋める（AI上限を守る）
  const remaining = scored
    .filter((e) => !selected.has(e.item.id))
    .sort((a, b) => b.normScore - a.normScore);

  for (const entry of remaining) {
    if (result.length >= TARGET) break;
    if (entry.item.marketCategory === "ai-tool" && aiCount >= MAX_AI_TOOL) continue;
    selected.add(entry.item.id);
    result.push(entry.item);
    if (entry.item.marketCategory === "ai-tool") aiCount++;
  }

  // 緩和フェーズ: まだ TARGET 未満なら上限を解除して埋める
  if (result.length < TARGET) {
    for (const entry of remaining) {
      if (result.length >= TARGET) break;
      if (selected.has(entry.item.id)) continue;
      selected.add(entry.item.id);
      result.push(entry.item);
    }
  }

  return result;
}

/**
 * 30件に満たない場合、取得件数を増やして再取得するかどうか判定する。
 */
export function needsMoreItems(count: number): boolean {
  return count < TARGET;
}
