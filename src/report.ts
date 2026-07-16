// Reputation report generation — the STA-3 scanning engine.
//
// Given a submitted name we aggregate findings from sanctioned sources into a
// single Report. Two source classes:
//
//   1. Data brokers — a curated registry (src/reputation/brokers.ts) of the
//      major US people-search directories, with their PUBLIC search pages and
//      PUBLISHED opt-out URLs. We construct links to those public pages; we do
//      not scrape, log in, or evade any access control. These are real,
//      actionable findings that feed the removal workflow (STA-5).
//
//   2. Open web (negative content / social / images) — scanned via a permitted,
//      key-authenticated vendor search API (src/reputation/search.ts). When no
//      search API is configured these categories return no findings and the
//      summary says so; we never fabricate content about a real person.
//
// This module is the seam the dashboard/removal code depends on. `generateReport`
// keeps returning a Report (now async); callers just await it.

import { randomUUID } from "node:crypto";
import { BROKER_DIRECTORY } from "./reputation/brokers.js";
import { fillSearchUrl } from "./reputation/name.js";
import {
  scanOpenWeb,
  searchClientFromEnv,
  type OpenWebContext,
  type WebSearchClient,
} from "./reputation/search.js";
import {
  reverseImageClientFromEnv,
  reverseImageFindings,
  type ReverseImageClient,
} from "./reputation/images.js";
import type { Finding, FindingCategory, Report, Severity } from "./types.js";

export interface GenerateReportOptions {
  /** Injectable for tests; defaults to the env-configured client (or none). */
  searchClient?: WebSearchClient | null;
  /** Optional disambiguators to sharpen open-web queries. */
  context?: OpenWebContext;
  /**
   * User-provided source image for reverse-image lookup (STA-6). Only used when
   * a permitted reverse-image client is available; otherwise ignored.
   */
  sourceImageUrl?: string;
  /** Injectable for tests; defaults to the env-configured client (or none). */
  reverseImageClient?: ReverseImageClient | null;
}

/**
 * Generate a reputation report for a submitted name.
 *
 * @param subjectName the person's name the user asked us to clean up
 * @param caseId      the case this report belongs to
 */
export async function generateReport(
  subjectName: string,
  caseId: string,
  opts: GenerateReportOptions = {},
): Promise<Report> {
  const name = subjectName.trim();
  const searchClient =
    opts.searchClient !== undefined ? opts.searchClient : searchClientFromEnv();
  const reverseImageClient =
    opts.reverseImageClient !== undefined
      ? opts.reverseImageClient
      : reverseImageClientFromEnv();

  const [brokerFindings, openWebFindings, reverseFindings] = await Promise.all([
    Promise.resolve(brokerFindingsFor(name)),
    scanOpenWeb(searchClient, name, opts.context ?? {}),
    reverseImageFindings(reverseImageClient, name, opts.sourceImageUrl),
  ]);

  const findings = [...brokerFindings, ...openWebFindings, ...reverseFindings];
  const score = scoreFromFindings(findings);
  const openWebScanned = searchClient !== null;

  return {
    id: randomUUID(),
    caseId,
    subjectName: name,
    generatedAt: new Date().toISOString(),
    score,
    summary: summarize(findings, score, openWebScanned),
    findings,
  };
}

/**
 * One `data_broker` finding per registered broker: a link to the broker's
 * public people-search page (or its home page when no stable search URL exists)
 * and, in the snippet, the published opt-out URL the removal workflow uses.
 */
function brokerFindingsFor(name: string): Finding[] {
  return BROKER_DIRECTORY.map((broker) => {
    const url = broker.searchUrlTemplate
      ? fillSearchUrl(broker.searchUrlTemplate, name)
      : broker.homeUrl;
    return {
      id: randomUUID(),
      category: "data_broker" as const,
      source: broker.name,
      brokerId: broker.id,
      title: `${broker.name} listing for ${name}`,
      url,
      snippet:
        `${broker.name} is a people-search directory that likely lists ${name} ` +
        `(address history, relatives, phone numbers). Opt out: ${broker.optOutUrl}`,
      severity: "medium" as Severity,
      removable: true,
    };
  });
}

/** 0-100 reputation score; more/severe findings -> lower score. */
function scoreFromFindings(findings: Finding[]): number {
  const weight: Record<Severity, number> = { low: 2, medium: 5, high: 9 };
  const penalty = findings.reduce((sum, f) => sum + weight[f.severity], 0);
  return Math.max(5, Math.min(100, 100 - penalty));
}

function summarize(findings: Finding[], score: number, openWebScanned: boolean): string {
  const byCat = countByCategory(findings);
  const removable = findings.filter((f) => f.removable).length;
  const parts: string[] = [];
  if (byCat.data_broker) parts.push(`${byCat.data_broker} data-broker listings`);
  if (byCat.web) parts.push(`${byCat.web} web results`);
  if (byCat.social) parts.push(`${byCat.social} social profiles`);
  if (byCat.image) parts.push(`${byCat.image} image results`);

  const health = score >= 75 ? "fairly clean" : score >= 45 ? "moderate exposure" : "high exposure";
  const found = parts.length ? `Found ${parts.join(", ")}.` : "No findings.";
  const coverage = openWebScanned
    ? ""
    : " Open-web scanning (negative content / social / images) was skipped — no search API configured (set SEARCH_PROVIDER + SEARCH_API_KEY).";

  return `Reputation score ${score}/100 (${health}). ${found} ${removable} of ${findings.length} items have a removal path.${coverage}`;
}

function countByCategory(findings: Finding[]): Record<FindingCategory, number> {
  const counts: Record<FindingCategory, number> = {
    web: 0,
    data_broker: 0,
    social: 0,
    image: 0,
  };
  for (const f of findings) counts[f.category]++;
  return counts;
}
