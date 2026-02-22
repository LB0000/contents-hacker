import { NormalizedItem } from "./types";
import { classifyByKeywords, type MarketCategory } from "./categories";

const TARGET = 30;
const MIN_PER_CATEGORY = 2;
const MAX_AI_TOOL = 10;

// ---------- OGP 自動補完 ----------

const OGP_TIMEOUT = 3_000;
const MAX_DESC_LENGTH = 400;
const MIN_DESC_LENGTH = 100;

/** Block private/loopback IPs to prevent SSRF */
function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "0.0.0.0") return false;
    // Block private IP ranges: 10.x, 172.16-31.x, 192.168.x, 169.254.x
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Extract OGP or meta description, handling both attribute orderings */
function extractDescription(html: string): string | null {
  // og:description — handles both property...content and content...property orders
  const ogDesc =
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i)?.[1];
  if (ogDesc) return ogDesc;

  // meta name=description — handles both orderings
  const metaDesc =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1];
  return metaDesc ?? null;
}

async function fetchOgp(url: string): Promise<string | null> {
  if (!isSafeUrl(url)) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OGP_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentsHacker/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    // Only read first 32KB to avoid downloading huge pages
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    const MAX_BYTES = 32_768;
    while (totalLength < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(Buffer.concat(chunks)).slice(0, MAX_BYTES);
    return extractDescription(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function supplementDescriptions(items: NormalizedItem[]): Promise<NormalizedItem[]> {
  const promises = items.map(async (item) => {
    if (item.desc_en.length >= MIN_DESC_LENGTH) return item;
    const desc = await fetchOgp(item.url);
    if (!desc) return item;
    const combined = `${item.desc_en} ${desc}`.trim().slice(0, MAX_DESC_LENGTH);
    return { ...item, desc_en: combined };
  });

  const results = await Promise.allSettled(promises);
  return results.map((r, i) => (r.status === "fulfilled" ? r.value : items[i]));
}

// ソース優先順位: HN > GH > PH=IH > BL=RD (スコア情報が豊富な順)
const SOURCE_PRIORITY: Record<string, number> = {
  hackernews: 4,
  github: 3,
  producthunt: 2,
  indiehackers: 2,
  betalist: 1,
  reddit: 1,
};

/**
 * URL重複排除して多様性を考慮しつつ rankScore 降順で30件に固定する。
 * 優先順位の高いソースを残し、低い方のtagsをマージする。
 */
export async function deduplicateAndTrim(items: NormalizedItem[]): Promise<NormalizedItem[]> {
  const byUrl = new Map<string, NormalizedItem>();

  for (const item of items) {
    let key: string;
    try {
      const u = new URL(item.url);
      u.hash = "";
      u.searchParams.delete("utm_source");
      u.searchParams.delete("utm_medium");
      u.searchParams.delete("utm_campaign");
      const host = u.host.replace(/^www\./, "");
      key = `${u.protocol}//${host}${u.pathname.replace(/\/$/, "")}${u.search}`;
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

  // 海外注目度: 正規化済みスコアをアイテムに設定
  for (const item of deduped) {
    (item as NormalizedItem).overseasPopularity = normalizedScore.get(item.id) ?? 0;
  }

  // OGP自動補完: desc_enが短い候補をURL先から補強
  const supplemented = await supplementDescriptions(deduped);

  // キーワードヒューリスティックで市場カテゴリを付与
  for (const item of supplemented) {
    item.marketCategory = classifyByKeywords(item);
  }

  // 多様性を考慮した30件選定
  return diverseSelect(supplemented, normalizedScore);
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
