import { describe, it, expect } from "vitest";
import {
  resolveImageTakedown,
  reverseImageFindings,
  reverseImageClientFromEnv,
  type ReverseImageClient,
} from "../src/reputation/images.js";
import { generateReport } from "../src/report.js";
import { deriveRemovals } from "../src/removals.js";

describe("image takedown routing (STA-6)", () => {
  it("routes Google-hosted image results to the personal-image removal tool", () => {
    const t = resolveImageTakedown(
      { url: "https://images.google.com/foo", source: "Image search" },
      "Jane Doe",
    );
    expect(t.channel).toMatch(/Google/i);
    expect(t.method).toBe("search_console");
    expect(t.channelUrl).toContain("support.google.com");
    expect(t.body).toContain("Jane Doe");
    expect(t.targetUrl).toBe("https://images.google.com/foo");
  });

  it("routes a known social host to that platform's report/takedown form", () => {
    const t = resolveImageTakedown(
      { url: "https://www.instagram.com/p/abc123/" },
      "Jane Doe",
    );
    expect(t.channel).toMatch(/Instagram/i);
    expect(t.method).toBe("web_form");
    expect(t.channelUrl).toContain("instagram.com");
  });

  it("falls back to host takedown + Google de-index for an unknown host", () => {
    const t = resolveImageTakedown(
      { url: "https://some-random-blog.example/gallery/pic.jpg" },
      "Jane Doe",
    );
    expect(t.channel).toMatch(/some-random-blog\.example/);
    expect(t.body).toMatch(/DMCA/i);
  });

  it("never throws on a missing/garbage url", () => {
    const t = resolveImageTakedown({ url: undefined }, "Jane Doe");
    expect(t.subject).toContain("Jane Doe");
    expect(t.channel).toBeTruthy();
  });
});

describe("reverse-image discovery (STA-6)", () => {
  it("is disabled with no env config", () => {
    expect(reverseImageClientFromEnv({})).toBeNull();
    // Provider without key stays off.
    expect(
      reverseImageClientFromEnv({ REVERSE_IMAGE_PROVIDER: "acme" }),
    ).toBeNull();
  });

  it("returns no findings without a client or source image", async () => {
    const client: ReverseImageClient = { lookup: async () => [{ pageUrl: "https://x.com/a" }] };
    expect(await reverseImageFindings(null, "Jane", "https://img/a.jpg")).toEqual([]);
    expect(await reverseImageFindings(client, "Jane", undefined)).toEqual([]);
  });

  it("maps reverse-image matches to removable image findings", async () => {
    const client: ReverseImageClient = {
      lookup: async () => [
        { pageUrl: "https://www.facebook.com/photo/xyz", title: "Old photo" },
      ],
    };
    const findings = await reverseImageFindings(client, "Jane Doe", "https://img/a.jpg");
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("image");
    expect(findings[0].removable).toBe(true);
    expect(findings[0].url).toBe("https://www.facebook.com/photo/xyz");
  });
});

describe("image hit -> tracked takedown request (STA-6 success condition)", () => {
  it("a reverse-image hit becomes a tracked removal carrying a takedown request", async () => {
    const reverseImageClient: ReverseImageClient = {
      lookup: async () => [
        { pageUrl: "https://www.instagram.com/p/abc/", title: "Profile pic" },
      ],
    };
    const report = await generateReport("Jane Doe", "case-img-1", {
      searchClient: null, // no open-web scan noise
      reverseImageClient,
      sourceImageUrl: "https://example.com/jane.jpg",
    });

    const imageFindings = report.findings.filter((f) => f.category === "image");
    expect(imageFindings.length).toBeGreaterThan(0);

    const removals = deriveRemovals(report);
    const imageRemovals = removals.filter((r) => r.category === "image");
    expect(imageRemovals.length).toBe(imageFindings.length);

    const r = imageRemovals[0];
    expect(r.status).toBe("pending");
    expect(r.takedown).toBeDefined();
    expect(r.takedown!.channel).toMatch(/Instagram/i);
    expect(r.takedown!.body).toContain("Jane Doe");
    // The removal's channel label reflects the specific route, not the generic default.
    expect(r.channel).toBe(r.takedown!.channel);
  });
});
