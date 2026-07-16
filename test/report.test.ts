import { describe, it, expect } from "vitest";
import { generateReport } from "../src/report.js";
import { BROKER_DIRECTORY } from "../src/reputation/brokers.js";
import type { WebSearchClient } from "../src/reputation/search.js";

describe("generateReport — data-broker scanning", () => {
  it("emits one real broker finding per registered broker", async () => {
    const report = await generateReport("Jane Doe", "case-1", { searchClient: null });

    const brokerFindings = report.findings.filter((f) => f.category === "data_broker");
    expect(brokerFindings.length).toBe(BROKER_DIRECTORY.length);
    // Every broker finding is removable and names a real broker in the registry.
    const brokerNames = new Set(BROKER_DIRECTORY.map((b) => b.name));
    for (const f of brokerFindings) {
      expect(f.removable).toBe(true);
      expect(brokerNames.has(f.source)).toBe(true);
      expect(f.url).toMatch(/^https:\/\//);
      // The published opt-out URL is surfaced for the removal workflow.
      expect(f.snippet).toContain("Opt out:");
    }
  });

  it("is deterministic and never fabricates open-web findings without a client", async () => {
    const a = await generateReport("John Smith", "c1", { searchClient: null });
    const b = await generateReport("John Smith", "c2", { searchClient: null });
    expect(a.score).toBe(b.score);
    // No search API -> no web/social/image findings, and the summary says so.
    expect(a.findings.some((f) => f.category !== "data_broker")).toBe(false);
    expect(a.summary).toContain("Open-web scanning");
  });

  it("uses the search client for open-web categories when configured", async () => {
    const fake: WebSearchClient = {
      async search(query: string) {
        return [{ title: `Result for ${query.slice(0, 8)}`, url: "https://example.com/x", snippet: "arrest record" }];
      },
    };
    const report = await generateReport("Rich Roe", "c3", { searchClient: fake });

    const categories = new Set(report.findings.map((f) => f.category));
    expect(categories.has("web")).toBe(true);
    expect(categories.has("social")).toBe(true);
    expect(categories.has("image")).toBe(true);
    // The negative-content result mentioning "arrest" is scored high severity.
    const web = report.findings.find((f) => f.category === "web");
    expect(web?.severity).toBe("high");
    expect(report.summary).not.toContain("Open-web scanning");
  });
});
