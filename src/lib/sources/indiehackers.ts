import { NormalizedItem } from "../types";

const IH_URL = "https://www.indiehackers.com/";
const USER_AGENT = "Mozilla/5.0 (compatible; ContentsHacker/1.0)";

/** 相対タイムスタンプ ("6h", "1d", "2w") をISO日時に変換 */
function relativeToISO(rel: string): string {
  const now = Date.now();
  const match = rel.match(/^(\d+)(m|h|d|w)$/);
  if (!match) return new Date(now).toISOString();

  const [, numStr, unit] = match;
  const num = parseInt(numStr, 10);
  const ms: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return new Date(now - num * (ms[unit] ?? 0)).toISOString();
}

interface IHPost {
  id: string;
  title: string;
  url: string;
  upvotes: number;
  timestamp: string;
}

function parseHTML(html: string): IHPost[] {
  const posts: IHPost[] = [];
  const seen = new Set<string>();

  // <a href="/product/slug?post=POSTID"> を起点にタイトル・upvotes・timestampを抽出
  const linkRegex = /<a[^>]+href="(\/product\/[^"?]+\?post=([^"&]+))"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const [, path, postId, inner] = match;
    if (seen.has(postId)) continue;

    // タイトルは <h3> 内にある
    const titleMatch = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    if (!titleMatch) continue;

    const title = titleMatch[1].replace(/<[^>]*>/g, "").trim();
    if (!title) continue;

    seen.add(postId);

    // このリンクの後方にあるupvotes・timestampを探す（次のpostリンクまでの範囲）
    const afterIdx = match.index + match[0].length;
    const nextPostMatch = linkRegex.exec(html);
    const searchEnd = nextPostMatch ? nextPostMatch.index : Math.min(afterIdx + 2000, html.length);
    // linkRegexのlastIndexを戻す（次のイテレーションで使えるように）
    if (nextPostMatch) linkRegex.lastIndex = nextPostMatch.index;
    const context = html.slice(afterIdx, searchEnd);

    const upMatch = context.match(/(\d+)\s*upvotes?/);
    const upvotes = upMatch ? parseInt(upMatch[1], 10) : 0;

    const timeMatch = context.match(/\b(\d+[mhdw])\b/);
    const timestamp = timeMatch ? relativeToISO(timeMatch[1]) : new Date().toISOString();

    posts.push({
      id: postId,
      title,
      url: `https://www.indiehackers.com${path}`,
      upvotes,
      timestamp,
    });
  }

  return posts;
}

export async function fetchIndiehackers(limit: number): Promise<NormalizedItem[]> {
  const res = await fetch(IH_URL, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Indie Hackers failed: ${res.status}`);

  const html = await res.text();
  const posts = parseHTML(html);

  if (posts.length === 0) {
    throw new Error("Indie Hackers: HTML構造が変更された可能性があります（0件抽出）");
  }

  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  return posts
    .filter((p) => new Date(p.timestamp).getTime() >= twoWeeksAgo)
    .slice(0, limit)
    .map((p) => ({
      id: `ih-${p.id}`,
      source: "indiehackers" as const,
      title_en: p.title,
      desc_en: "",
      url: p.url,
      tags: [],
      publishedAt: p.timestamp,
      sourceScore: p.upvotes,
      marketCategory: "other" as const,
    }));
}
