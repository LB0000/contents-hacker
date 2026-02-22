import { NormalizedItem } from "../types";

const PH_FEED_URL = "https://www.producthunt.com/feed";

/** Atom/RSS XMLから簡易パースでアイテムを抽出 */
function parseFeedItems(xml: string): Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
}> {
  const items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];

  // Atom形式: <entry>...</entry>
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  // RSS形式: <item>...</item>
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;

  const blocks: string[] = [];
  let match;
  while ((match = entryRegex.exec(xml)) !== null) blocks.push(match[1]);
  while ((match = itemRegex.exec(xml)) !== null) blocks.push(match[1]);

  for (const block of blocks) {
    const title = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>([\s\S]*?)<\/title>/)?.[1]
      ?? "";

    // Atom: <link rel="alternate" href="URL"/>  RSS: <link>URL</link>
    const link = block.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"/)?.[1]
      ?? block.match(/<link[^>]+href="([^"]+)"[^>]*rel="alternate"/)?.[1]
      ?? block.match(/<link>([\s\S]*?)<\/link>/)?.[1]
      ?? "";

    // Atom: <content>  RSS: <description>
    const description = block.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1]
      ?? block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]
      ?? block.match(/<description>([\s\S]*?)<\/description>/)?.[1]
      ?? "";

    // Atom: <published>  RSS: <pubDate>
    const pubDate = block.match(/<published>([\s\S]*?)<\/published>/)?.[1]
      ?? block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]
      ?? "";

    if (title && link) {
      items.push({ title, link, description, pubDate });
    }
  }

  return items;
}

export async function fetchProductHunt(limit: number): Promise<NormalizedItem[]> {
  const res = await fetch(PH_FEED_URL);
  if (!res.ok) throw new Error(`Product Hunt feed failed: ${res.status}`);

  const xml = await res.text();
  const feedItems = parseFeedItems(xml);

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  return feedItems
    .filter((item) => {
      if (!item.pubDate) return false;
      const published = new Date(item.pubDate).getTime();
      return !isNaN(published) && published >= fourteenDaysAgo;
    })
    .slice(0, limit)
    .map((item, i) => ({
      id: `ph-${item.link.replace(/\/+$/, "").split("/").pop() || String(i)}`,
      source: "producthunt" as const,
      title_en: item.title,
      desc_en: item.description.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 400),
      url: item.link,
      tags: [],
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      sourceScore: null,
      marketCategory: "other",
    }));
}
