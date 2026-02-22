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
      normalizedScore.set(it.id, (it.sourceScore ?? 0 - min) / range);
    }
  }

  deduped.sort((a, b) => (normalizedScore.get(b.id) ?? 0) - (normalizedScore.get(a.id) ?? 0));

  return deduped.slice(0, TARGET);
}

/**
 * 30件に満たない場合、取得件数を増やして再取得するかどうか判定する。
 */
export function needsMoreItems(count: number): boolean {
  return count < TARGET;
}
