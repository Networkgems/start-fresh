import { describe, it, expect } from "vitest";
import {
  identifyPlatform,
  socialDisconnectFor,
  SOCIAL_PLATFORMS,
} from "../src/reputation/social.js";
import { deriveRemovals } from "../src/removals.js";
import type { Finding, Report } from "../src/types.js";

describe("identifyPlatform", () => {
  it("matches known platforms by host, ignoring www/subdomains", () => {
    expect(identifyPlatform("https://www.linkedin.com/in/jane-doe")?.id).toBe("linkedin");
    expect(identifyPlatform("https://m.facebook.com/jane")?.id).toBe("facebook");
    expect(identifyPlatform("https://instagram.com/jane")?.id).toBe("instagram");
    expect(identifyPlatform("https://twitter.com/jane")?.id).toBe("x");
    expect(identifyPlatform("https://x.com/jane")?.id).toBe("x");
    expect(identifyPlatform("https://www.tiktok.com/@jane")?.id).toBe("tiktok");
  });

  it("returns null for non-social, malformed, or missing URLs", () => {
    expect(identifyPlatform("https://example.com/jane")).toBeNull();
    expect(identifyPlatform("not a url")).toBeNull();
    expect(identifyPlatform(undefined)).toBeNull();
  });

  it("does not match a lookalike host as a subdomain suffix", () => {
    // notlinkedin.com must not match linkedin.com
    expect(identifyPlatform("https://notlinkedin.com/x")).toBeNull();
  });
});

describe("socialDisconnectFor", () => {
  it("builds platform-specific channel + guided steps + published controls", () => {
    const d = socialDisconnectFor({ url: "https://www.linkedin.com/in/jane" });
    expect(d.channel).toBe("LinkedIn privacy & account controls");
    expect(d.guidance.platform).toBe("LinkedIn");
    expect(d.guidance.steps.length).toBeGreaterThanOrEqual(2);
    expect(d.guidance.controls.length).toBeGreaterThanOrEqual(1);
    // Every linked control is an https URL (a published self-service page).
    for (const c of d.guidance.controls) {
      expect(c.url).toMatch(/^https:\/\//);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it("falls back to generic guidance for an unknown platform", () => {
    const d = socialDisconnectFor({ url: "https://someforum.example/user/jane" });
    expect(d.channel).toBe("Platform privacy / account controls");
    expect(d.guidance.platform).toBe("Social profile");
    expect(d.guidance.steps.length).toBeGreaterThan(0);
    expect(d.guidance.controls).toEqual([]);
  });

  it("registry controls all use https", () => {
    for (const p of SOCIAL_PLATFORMS) {
      for (const c of p.controls) expect(c.url).toMatch(/^https:\/\//);
    }
  });
});

describe("deriveRemovals — social findings become tracked disconnect actions", () => {
  function reportWith(findings: Finding[]): Report {
    return {
      id: "rep-1",
      caseId: `case-${Math.round(Math.random() * 1e9)}`,
      subjectName: "Jane Doe",
      generatedAt: new Date().toISOString(),
      score: 60,
      summary: "test",
      findings,
    };
  }

  it("attaches disconnect guidance to a social removal", () => {
    const finding: Finding = {
      id: "f-social",
      category: "social",
      source: "Social profiles",
      title: "Jane Doe — LinkedIn",
      url: "https://www.linkedin.com/in/jane-doe",
      snippet: "LinkedIn profile",
      severity: "medium",
      removable: true,
    };
    const [removal] = deriveRemovals(reportWith([finding]));
    expect(removal.category).toBe("social");
    expect(removal.status).toBe("pending");
    expect(removal.channel).toBe("LinkedIn privacy & account controls");
    expect(removal.guidance).toBeDefined();
    expect(removal.guidance?.platform).toBe("LinkedIn");
    expect(removal.guidance?.controls.length).toBeGreaterThan(0);
  });

  it("does not attach guidance to non-social removals", () => {
    const finding: Finding = {
      id: "f-broker",
      category: "data_broker",
      source: "Spokeo",
      title: "Spokeo listing for Jane Doe",
      url: "https://www.spokeo.com/jane-doe",
      snippet: "listing",
      severity: "medium",
      removable: true,
    };
    const [removal] = deriveRemovals(reportWith([finding]));
    expect(removal.guidance).toBeUndefined();
  });
});
