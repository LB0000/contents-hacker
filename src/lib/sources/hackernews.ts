import { NormalizedItem } from "../types";

const HN_API = "https://hacker-news.firebaseio.com/v0";

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  type?: string;
  text?: string;
  time?: number;
}

const CHUNK_SIZE = 10;

async function fetchInChunks(ids: number[]): Promise<(HNItem | null)[]> {
  const results: (HNItem | null)[] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (id): Promise<HNItem | null> => {
        try {
          const r = await fetch(`${HN_API}/item/${id}.json`);
          if (!r.ok) return null;
          return await r.json();
        } catch {
          return null;
        }
      })
    );
    results.push(...chunkResults);
  }
  return results;
}

export async function fetchHackerNews(limit: number): Promise<NormalizedItem[]> {
  const res = await fetch(`${HN_API}/topstories.json`);
  if (!res.ok) throw new Error(`HN topstories failed: ${res.status}`);

  const ids: number[] = await res.json();
  const sliced = ids.slice(0, limit);

  const items = await fetchInChunks(sliced);

  return items
    .filter((it): it is HNItem => it !== null && it.type === "story" && !!it.title)
    .map((it) => ({
      id: `hn-${it.id}`,
      source: "hackernews" as const,
      title_en: it.title!,
      desc_en: it.text?.slice(0, 200) ?? "",
      url: it.url ?? `https://news.ycombinator.com/item?id=${it.id}`,
      tags: [],
      publishedAt: it.time ? new Date(it.time * 1000).toISOString() : new Date().toISOString(),
      sourceScore: it.score ?? null,
    }));
}
