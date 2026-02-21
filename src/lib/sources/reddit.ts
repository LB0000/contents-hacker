import { NormalizedItem } from "../types";

const REDDIT_URL = "https://www.reddit.com/r/SaaS/hot.json";

interface RedditPost {
  kind: string;
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

export async function fetchReddit(limit: number): Promise<NormalizedItem[]> {
  const res = await fetch(`${REDDIT_URL}?limit=${Math.min(limit, 50)}`, {
    headers: { "User-Agent": "ContentsHacker/1.0" },
  });

  if (!res.ok) throw new Error(`Reddit API failed: ${res.status}`);

  const json = await res.json();
  const posts: RedditPost[] = json?.data?.children ?? [];

  return posts
    .filter((p) => !p.data.stickied && !p.data.is_self)
    .map((p) => ({
      id: `rd-${p.data.id}`,
      source: "reddit" as const,
      title_en: p.data.title,
      desc_en: p.data.selftext?.slice(0, 200) ?? "",
      url: p.data.url,
      tags: [],
      publishedAt: new Date(p.data.created_utc * 1000).toISOString(),
      sourceScore: p.data.score,
    }));
}
