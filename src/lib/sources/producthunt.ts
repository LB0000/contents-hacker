import { NormalizedItem } from "../types";

const PH_RSS_URL = "https://www.producthunt.com/feed";

/** RSS XMLから簡易パースでアイテムを抽出 */
function parseRssItems(xml: string): Array<{
  title: string;
  link: string;
  description: string;
  pubDate: string;
}> {
  const items: Array<{ title: string; link: string; description: string; pubDate: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1]
      ?? "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
    const description = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
      ?? block.match(/<description>(.*?)<\/description>/)?.[1]
      ?? "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";

    if (title && link) {
      items.push({ title, link, description, pubDate });
    }
  }

  return items;
}

export async function fetchProductHunt(limit: number): Promise<NormalizedItem[]> {
  const res = await fetch(PH_RSS_URL);
  if (!res.ok) throw new Error(`Product Hunt RSS failed: ${res.status}`);

  const xml = await res.text();
  const rssItems = parseRssItems(xml);

  return rssItems.slice(0, limit).map((item, i) => ({
    id: `ph-${item.link.split("/").pop() || String(i)}`,
    source: "producthunt" as const,
    title_en: item.title,
    desc_en: item.description.replace(/<[^>]*>/g, "").slice(0, 200),
    url: item.link,
    tags: [],
    publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
    sourceScore: null,
  }));
}
