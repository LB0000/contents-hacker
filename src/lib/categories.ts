import type { NormalizedItem } from "./types";

export const MARKET_CATEGORIES = [
  "ec-optimize",
  "analog-dx",
  "info-gap-ai",
  "marketplace",
  "vertical-saas",
  "devtool",
  "ai-tool",
  "other",
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export const CATEGORY_BADGE: Record<MarketCategory, { label: string; color: string }> = {
  "ai-tool":       { label: "AI",     color: "bg-violet-900 text-violet-300" },
  "ec-optimize":   { label: "EC",     color: "bg-amber-900 text-amber-300" },
  "analog-dx":     { label: "DX",     color: "bg-teal-900 text-teal-300" },
  "info-gap-ai":   { label: "情報格差", color: "bg-pink-900 text-pink-300" },
  "marketplace":   { label: "MP",     color: "bg-sky-900 text-sky-300" },
  "vertical-saas": { label: "Vert",   color: "bg-lime-900 text-lime-300" },
  "devtool":       { label: "Dev",    color: "bg-gray-700 text-gray-300" },
  "other":         { label: "他",     color: "bg-stone-800 text-stone-300" },
};

// ai-tool は最後にチェック: "EC + AI" のようなものが具体的なカテゴリに入るように
const CATEGORY_RULES: { category: MarketCategory; patterns: RegExp[] }[] = [
  {
    category: "ec-optimize",
    patterns: [
      /\b(e-?commerce|shopify|woocommerce|amazon\s?seller|product\s?listing|checkout|cart\s?abandon|dropship|fulfillment|inventory\s?manage|retail\s?tech|payment|stripe|pos(?:\s|$)|point[.\s-]of[.\s-]sale|pricing\s?optim|order\s?manage|product\s?feed|merchant|storefront)/i,
    ],
  },
  {
    category: "analog-dx",
    patterns: [
      /\b(construction|real\s?estate|property\s?manage|restaurant|food\s?service|agriculture|farming|healthcare|clinic|dental|salon|barber|hotel|hospitality|logistics|warehouse|fleet|field\s?service|manufacturing|factory|crm\s?for|digitiz|paper-?less|funeral|wedding)/i,
    ],
  },
  {
    category: "info-gap-ai",
    patterns: [
      /\b(no-?code|low-?code|non-?technic|small\s?business|local\s?business|ai\s?(for|helps?)\s?(small|non|every)|simpli|automat.*(?:small|sme|smb)|beginner|easy.to.use.*ai|accessible)/i,
    ],
  },
  {
    category: "marketplace",
    patterns: [
      /\b(marketplace|two-?sided|matching|freelanc|gig\s?econom|peer.to.peer|p2p\s?platform|connect.*(?:buyer|seller|provider|client)|hire\s?(?:a|an)|talent\s?platform)/i,
    ],
  },
  {
    category: "vertical-saas",
    patterns: [
      /\b(legal\s?tech|law\s?firm|accounting|bookkeep|tax\s?(?:software|tool)|hr\s?(?:software|tool|platform)|recruit|ats\b|crm\b|erp\b|insurance\s?tech|fintech|edtech|proptech|medtech|govtech)/i,
    ],
  },
  {
    category: "devtool",
    patterns: [
      /\b(developer|sdk\b|api\s?(?:gateway|platform|tool)|cli\s?tool|framework|library|open.?source|debug|deploy|ci.?cd|devops|monitoring|observ|infrastructure|database|orm\b|testing\s?framework|code\s?review|ide\b|terminal|self.?host)/i,
    ],
  },
  {
    category: "ai-tool",
    patterns: [
      /\b(ai\b|artificial.intellig|machine.learn|llm\b|gpt|chatbot|copilot|generat.*(?:text|image|video|code)|prompt|diffusion|neural|deep.learn|nlp\b|computer.vision|rag\b|vector\s?(?:db|database|search))/i,
    ],
  },
];

/** title_en + desc_en + tags からキーワードヒューリスティックで市場カテゴリを推定 */
export function classifyByKeywords(item: Pick<NormalizedItem, "title_en" | "desc_en" | "tags">): MarketCategory {
  const text = `${item.title_en} ${item.desc_en} ${item.tags.join(" ")}`.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return rule.category;
    }
  }
  return "other";
}
