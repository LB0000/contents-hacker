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
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const perPage = Math.min(limit, 30); // GitHub API max per_page is 100, but keep small for rate limit

  const res = await fetch(
    `${GITHUB_API}?q=created:>${weekAgo}+topic:saas+topic:webapp+topic:tool&sort=stars&order=desc&per_page=${perPage}`,
    { headers: { Accept: "application/vnd.github.v3+json" } }
  );

  if (!res.ok) throw new Error(`GitHub API failed: ${res.status}`);

  const json = await res.json();
  const repos: GHRepo[] = json?.items ?? [];

  return repos.map((repo) => ({
    id: `gh-${repo.id}`,
    source: "github" as const,
    title_en: repo.full_name,
    desc_en: repo.description?.slice(0, 200) ?? "",
    url: repo.html_url,
    tags: repo.topics?.slice(0, 8) ?? [],
    publishedAt: repo.created_at,
    sourceScore: repo.stargazers_count,
  }));
}
