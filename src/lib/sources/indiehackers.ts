import { NormalizedItem } from "../types";

const IH_URL = "https://www.indiehackers.com/";
const USER_AGENT = "Mozilla/5.0 (compatible; ContentsHacker/1.0)";
const FETCH_TIMEOUT = 10_000;

/** HTMLエンティティをデコード */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

/** 相対タイムスタンプ ("6h", "1d", "2w") をISO日時に変換 */
function relativeToISO(rel: string): string {
  const match = rel.match(/^(\d{1,3})(m|h|d|w)$/);
  if (!match) return new Date().toISOString();

  const [, numStr, unit] = match;
  const num = parseInt(numStr, 10);
  const ms: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return new Date(Date.now() - num * (ms[unit] ?? 0)).toISOString();
}

interface IHPost {
  id: string;
  title: string;
  url: string;
  upvotes: number;
  timestamp: string;
}

/**
 * IHのHTML構造（Ember.js + Fastboot SSR）:
 * <div class="story homepage-post ...">
 *   <a href="/product/slug?post=ID" class="... story__text-link ..."><h3 class="story__title">Title</h3></a>
 *   <div class="story__counts">
 *     <a class="... story__count--likes"><span class="story__count-number">20</span><span>upvotes</span></a>
 *   </div>
 *   <a class="... story__time-ago ..."><span>6h</span></a>
 * </div>
 */
function parseHTML(html: string): IHPost[] {
  const posts: IHPost[] = [];
  const seen = new Set<string>();

  // story ブロック単位で切り出す
  const storyRegex = /<div[^>]+class="[^"]*story\s+homepage-post[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]+class="[^"]*story\s|$)/g;
  let storyMatch;
  while ((storyMatch = storyRegex.exec(html)) !== null) {
    const block = storyMatch[1];

    // URL抽出: /product/slug?post=ID または /post/slug-ID
    const productLink = block.match(/<a[^>]+href="(\/product\/[^"?]+\?post=([^"&]+))"/);
    const postLink = block.match(/<a[^>]+href="(\/post\/[^"]+?-([a-zA-Z0-9]{20,}))"/);
    const link = productLink || postLink;
    if (!link) continue;

    const [, path, postId] = link;
    if (seen.has(postId)) continue;

    // タイトル: <h3 class="story__title">...</h3>
    const titleMatch = block.match(/<h3[^>]*class="[^"]*story__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/);
    if (!titleMatch) continue;

    const title = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, "").trim());
    if (!title) continue;

    seen.add(postId);

    // Upvotes: <span class="story__count-number">N</span> within story__count--likes
    const likesBlock = block.match(/story__count--likes[\s\S]*?<span[^>]*class="[^"]*story__count-number[^"]*"[^>]*>(\d+)<\/span>/);
    const upvotes = likesBlock ? parseInt(likesBlock[1], 10) : 0;

    // タイムスタンプ: <a class="... story__time-ago ..."><span>6h</span></a>
    const timeBlock = block.match(/story__time-ago[\s\S]*?<span[^>]*>(\d{1,3}[mhdw])<\/span>/);
    const timestamp = timeBlock ? relativeToISO(timeBlock[1]) : new Date().toISOString();

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(IH_URL, {
      signal: controller.signal,
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
      .sort((a, b) => b.upvotes - a.upvotes)
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
        marketCategory: "other",
      }));
  } finally {
    clearTimeout(timeoutId);
  }
}
