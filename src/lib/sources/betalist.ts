import { NormalizedItem } from "../types";

const BL_URL = "https://betalist.com/";
const USER_AGENT = "Mozilla/5.0 (compatible; ContentsHacker/1.0)";

/** "Today", "Yesterday", "February 19th" 等をISO日時に変換 */
function parseBetaListDate(text: string): string {
  const now = new Date();
  const lower = text.trim().toLowerCase();

  if (lower.includes("today")) return now.toISOString();
  if (lower.includes("yesterday")) {
    return new Date(now.getTime() - 86_400_000).toISOString();
  }

  // "February 19th" 等のパターン
  const cleaned = text.replace(/(st|nd|rd|th)/g, "").trim();
  const parsed = new Date(`${cleaned} ${now.getFullYear()}`);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();

  return now.toISOString();
}

interface BLStartup {
  slug: string;
  name: string;
  description: string;
  date: string;
}

function parseHTML(html: string): BLStartup[] {
  const startups: BLStartup[] = [];
  const seen = new Set<string>();

  // <a href="/startups/slug"> ブロックを探す
  const linkRegex = /<a[^>]+href="\/startups\/([a-z0-9_-]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const [, slug, inner] = match;
    if (seen.has(slug)) continue;
    // /startups/slug/visit 等のサブパスは除外
    if (match[0].includes(`/startups/${slug}/`)) continue;

    // imgタグやSVGを除外して残りのテキストを取得
    const textOnly = inner
      .replace(/<img[^>]*>/g, "")
      .replace(/<svg[\s\S]*?<\/svg>/g, "")
      .replace(/<[^>]*>/g, "\n")
      .replace(/\s+/g, " ")
      .trim();

    if (!textOnly || textOnly.length < 3) continue;

    seen.add(slug);

    // 最初の文がname、残りがdescription
    const parts = textOnly.split(/\s{2,}|\n/).filter(Boolean);
    const name = parts[0]?.trim() ?? slug;
    const description = parts.slice(1).join(" ").trim();

    // リンクの前後から日付テキストを探す
    const afterIdx = match.index + match[0].length;
    const context = html.slice(Math.max(0, match.index - 500), afterIdx + 500);
    const dateMatch = context.match(/(Today|Yesterday|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?)/i);
    const date = dateMatch ? parseBetaListDate(dateMatch[1]) : new Date().toISOString();

    startups.push({ slug, name, description, date });
  }

  return startups;
}

export async function fetchBetaList(limit: number): Promise<NormalizedItem[]> {
  const res = await fetch(BL_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`BetaList failed: ${res.status}`);

  const html = await res.text();
  const startups = parseHTML(html);

  if (startups.length === 0) {
    throw new Error("BetaList: HTML構造が変更された可能性があります（0件抽出）");
  }

  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  return startups
    .filter((s) => new Date(s.date).getTime() >= twoWeeksAgo)
    .slice(0, limit)
    .map((s) => ({
      id: `bl-${s.slug}`,
      source: "betalist" as const,
      title_en: s.name,
      desc_en: s.description.slice(0, 400),
      url: `https://betalist.com/startups/${s.slug}`,
      tags: [],
      publishedAt: s.date,
      sourceScore: null,
      marketCategory: "other" as const,
    }));
}
