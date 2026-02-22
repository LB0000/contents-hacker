import { NormalizedItem } from "../types";

const GITHUB_API = "https://api.github.com/search/repositories";

interface GHRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  topics: string[];
  created_at: string;
}

export async function fetchGitHub(limit: number): Promise<NormalizedItem[]> {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const perPage = Math.min(limit, 30);

  const q = encodeURIComponent(`created:>${twoWeeksAgo} stars:>10`);
  const res = await fetch(
    `${GITHUB_API}?q=${q}&sort=stars&order=desc&per_page=${perPage}`,
    { headers: {
      Accept: "application/vnd.github.v3+json",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    } }
  );

  if (!res.ok) {
    const statusHint = res.status === 403 ? " (rate limit — try again in a few minutes)" : "";
    throw new Error(`GitHub API failed: ${res.status}${statusHint}`);
  }

  const json = await res.json();
  const repos: GHRepo[] = json?.items ?? [];

  const NOISE_KEYWORDS = ["clone", "tutorial", "template", "awesome-list", "interview"];

  return repos
    .filter((repo) => {
      const desc = (repo.description ?? "").toLowerCase();
      if (NOISE_KEYWORDS.some((kw) => desc.includes(kw))) return false;
      return true;
    })
    .map((repo) => ({
      id: `gh-${repo.id}`,
      source: "github" as const,
      title_en: repo.full_name,
      desc_en: repo.description?.slice(0, 400) ?? "",
      url: repo.html_url,
      tags: repo.topics?.slice(0, 8) ?? [],
      publishedAt: repo.created_at,
      sourceScore: repo.stargazers_count,
    }));
}
