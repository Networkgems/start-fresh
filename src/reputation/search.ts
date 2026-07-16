// Open-web scanning for the reputation engine (negative content, social, image).
//
// This is the ONLY place we talk to the live web, and it does so exclusively
// through a permitted, key-authenticated vendor search API (Brave Search).
// We never HTML-scrape a search engine or evade rate limits. When no API key
// is configured the scan returns no findings (and reports why) rather than
// fabricating content about a real person.

import { randomUUID } from "node:crypto";
import type { Finding, FindingCategory, Severity } from "../types.js";

/** One result from a permitted web-search API. */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
}

/**
 * A permitted, published web-search API. Implementations MUST use the vendor's
 * sanctioned API with a valid key.
 */
export interface WebSearchClient {
  search(query: string): Promise<WebSearchResult[]>;
}

/**
 * Build a search client from environment config, or `null` when unconfigured.
 *
 *   SEARCH_PROVIDER=brave
 *   SEARCH_API_KEY=<key>
 */
export function searchClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): WebSearchClient | null {
  const provider = env.SEARCH_PROVIDER?.trim().toLowerCase();
  const apiKey = env.SEARCH_API_KEY?.trim();
  if (!provider || !apiKey) return null;
  if (provider === "brave") return new BraveSearchClient(apiKey);
  return null; // unknown provider — treat as unconfigured rather than guessing
}

/**
 * Brave Search API client — Brave's official, key-authenticated web-search
 * endpoint. Docs: https://api.search.brave.com/app/documentation/web-search
 */
export class BraveSearchClient implements WebSearchClient {
  private static readonly ENDPOINT =
    "https://api.search.brave.com/res/v1/web/search";
  private static readonly COUNT = 10;

  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<WebSearchResult[]> {
    const url = new URL(BraveSearchClient.ENDPOINT);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(BraveSearchClient.COUNT));

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey,
      },
    });
    if (!res.ok) throw new Error(`Brave Search API returned ${res.status}`);

    const body = (await res.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    return (body.web?.results ?? [])
      .filter(
        (r): r is { title: string; url: string; description?: string } =>
          typeof r.url === "string" && typeof r.title === "string",
      )
      .map((r) => ({ title: r.title, url: r.url, snippet: r.description }));
  }
}

/** Optional identifiers that sharpen the query for a common name. */
export interface OpenWebContext {
  city?: string;
  state?: string;
}

const NEGATIVE_TERMS =
  "(arrest OR lawsuit OR scandal OR complaint OR fraud OR mugshot OR convicted)";
const SOCIAL_SITES =
  "(site:linkedin.com OR site:facebook.com OR site:instagram.com OR site:twitter.com OR site:x.com OR site:tiktok.com)";

/** Words that mark an open-web result as a serious reputational concern. */
const HIGH_SEVERITY_WORDS =
  /\b(arrest|convict|fraud|lawsuit|scandal|mugshot|felony|indict)/i;

interface CategoryScan {
  category: FindingCategory;
  /** Human-readable source label. */
  source: string;
  query: (name: string, ctx: OpenWebContext) => string;
  severity: (r: WebSearchResult) => Severity;
  removable: boolean;
}

const SCANS: CategoryScan[] = [
  {
    category: "web",
    source: "Open-web search",
    query: (name, ctx) => `${phrase(name, ctx)} ${NEGATIVE_TERMS}`,
    severity: (r) =>
      HIGH_SEVERITY_WORDS.test(`${r.title} ${r.snippet ?? ""}`) ? "high" : "medium",
    removable: true, // Google "Results about you" suppression path (STA-10)
  },
  {
    category: "social",
    source: "Social profiles",
    query: (name, ctx) => `${phrase(name, ctx)} ${SOCIAL_SITES}`,
    severity: () => "medium",
    removable: true, // platform privacy / account controls (STA-7)
  },
  {
    category: "image",
    source: "Image search",
    query: (name, ctx) => `${phrase(name, ctx)} (photo OR headshot OR "profile picture")`,
    severity: () => "medium",
    removable: true, // image takedown / de-index (STA-6)
  },
];

/**
 * Run the open-web scans against the configured search client and return
 * findings. With no client, returns an empty array — the caller reports the
 * reduced coverage; we do not invent findings.
 */
export async function scanOpenWeb(
  client: WebSearchClient | null,
  name: string,
  ctx: OpenWebContext = {},
): Promise<Finding[]> {
  if (!client) return [];

  const perScan = await Promise.all(
    SCANS.map(async (scan) => {
      const results = await client.search(scan.query(name, ctx));
      return results.map(
        (r): Finding => ({
          id: randomUUID(),
          category: scan.category,
          source: scan.source,
          title: r.title,
          url: r.url,
          snippet: r.snippet ?? `${scan.source} result for ${name}.`,
          severity: scan.severity(r),
          removable: scan.removable,
        }),
      );
    }),
  );
  return perScan.flat();
}

/** Phrase-quote the name and append location tokens when provided. */
function phrase(name: string, ctx: OpenWebContext): string {
  return [`"${name}"`, ctx.city, ctx.state].filter(Boolean).join(" ");
}
