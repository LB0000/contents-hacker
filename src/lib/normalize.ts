import { NormalizedItem } from "./types";

const TARGET = 30;

// ソース優先順位: HN > GH > PH > RD (スコア情報が豊富な順)
const SOURCE_PRIORITY: Record<string, number> = {
  hackernews: 4,
  github: 3,
  producthunt: 2,
  reddit: 1,
};

/**
 * URL重複排除して rankScore 降順で30件に固定する。
 * 優先順位の高いソースを残し、低い方のtagsをマージする。
 */
export function deduplicateAndTrim(items: NormalizedItem[]): NormalizedItem[] {
  const byUrl = new Map<string, NormalizedItem>();

  for (const item of items) {
    const key = item.url.replace(/\/$/, "").toLowerCase();
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

  // rankScore でソート（sourceScore がある方を優先、なければ 0）
  deduped.sort((a, b) => (b.sourceScore ?? 0) - (a.sourceScore ?? 0));

  return deduped.slice(0, TARGET);
}

/**
 * 30件に満たない場合、取得件数を増やして再取得するかどうか判定する。
 */
export function needsMoreItems(count: number): boolean {
  return count < TARGET;
}
