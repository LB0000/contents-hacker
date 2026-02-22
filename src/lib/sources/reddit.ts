import { NormalizedItem } from "../types";

const USER_AGENT = "Mozilla/5.0 (compatible; ContentsHacker/1.0)";
const SUBREDDITS = ["SaaS", "startups", "SideProject"];

// ---------- RSS パーサー ----------

interface RssFeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

function parseRedditRss(xml: string): RssFeedItem[] {
  const items: RssFeedItem[] = [];

  // Atom: <entry>...</entry>
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  // RSS: <item>...</item>
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;

  const blocks: string[] = [];
  let match;
  while ((match = entryRegex.exec(xml)) !== null) blocks.push(match[1]);
  while ((match = itemRegex.exec(xml)) !== null) blocks.push(match[1]);

  for (const block of blocks) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "";

    const link = block.match(/<link[^>]+href="([^"]+)"/)?.[1]
      ?? block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
      ?? "";

    const description = block.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1]
      ?? block.match(/<description>([\s\S]*?)<\/description>/)?.[1]
      ?? "";

    const pubDate = block.match(/<published>([\s\S]*?)<\/published>/)?.[1]
      ?? block.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]
      ?? block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]
      ?? "";

    if (title && link) {
      items.push({ title, link, description, pubDate });
    }
  }

  return items;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .trim();
}

// ---------- サブレディット取得（RSS → JSONフォールバック） ----------

async function fetchSubredditRss(subreddit: string, limit: number): Promise<NormalizedItem[]> {
  // 1. RSS取得を試行
  try {
    const rssUrl = `https://www.reddit.com/r/${subreddit}/hot.rss?limit=${Math.min(limit, 50)}`;
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (res.ok) {
      const xml = await res.text();
      const feedItems = parseRedditRss(xml);

      const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

      return feedItems
        .filter((item) => {
          if (!item.pubDate) return true; // RSSに日付がないことがある
          const published = new Date(item.pubDate).getTime();
          return !isNaN(published) && published >= fourteenDaysAgo;
        })
        .slice(0, limit)
        .map((item) => {
          // Extract Reddit post ID from URL: /r/{subreddit}/comments/{id}/...
          const commentMatch = item.link.match(/\/comments\/([a-z0-9]+)/i);
          const postId = commentMatch ? commentMatch[1] : `${subreddit}-${item.link.replace(/\/+$/, "").split("/").pop() || "unknown"}`;
          return {
          id: `rd-${postId}`,
          source: "reddit" as const,
          title_en: decodeHtmlEntities(item.title),
          desc_en: decodeHtmlEntities(item.description).slice(0, 400),
          url: item.link,
          tags: [],
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          sourceScore: null, // RSSにはスコア情報なし
          marketCategory: "other",
          };
        });
    }
    // RSS失敗 → JSONフォールバックへ
  } catch {
    // RSS取得エラー → JSONフォールバックへ
  }

  // 2. JSONフォールバック
  return fetchSubredditJson(subreddit, limit);
}

interface RedditPost {
  data: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    permalink: string;
    score: number;
    created_utc: number;
    stickied: boolean;
    is_self: boolean;
  };
}

async function fetchSubredditJson(subreddit: string, limit: number): Promise<NormalizedItem[]> {
  const perSub = Math.min(limit, 50);
  const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${perSub}&raw_json=1`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`Reddit r/${subreddit} failed: ${res.status}`);

  const json = await res.json();
  const posts: RedditPost[] = json?.data?.children ?? [];

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  return posts
    .filter((p) => !p.data.stickied && p.data.created_utc * 1000 >= fourteenDaysAgo)
    .map((p) => ({
      id: `rd-${p.data.id}`,
      source: "reddit" as const,
      title_en: p.data.title,
      desc_en: p.data.selftext?.slice(0, 400) ?? "",
      url: p.data.is_self ? `https://www.reddit.com${p.data.permalink}` : p.data.url,
      tags: [],
      publishedAt: new Date(p.data.created_utc * 1000).toISOString(),
      sourceScore: p.data.score,
      marketCategory: "other",
    }));
}

// ---------- エクスポート ----------

export async function fetchReddit(limit: number): Promise<NormalizedItem[]> {
  const perSub = Math.ceil(limit / SUBREDDITS.length);

  const results = await Promise.allSettled(
    SUBREDDITS.map((sub) => fetchSubredditRss(sub, perSub))
  );

  const allItems: NormalizedItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allItems.push(...r.value);
  }

  if (allItems.length === 0) {
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
    throw new Error(`Reddit failed: ${errors.join("; ")}`);
  }

  return allItems;
}
