// Image removal flow (STA-6).
//
// Two responsibilities, both constrained to SANCTIONED, published channels:
//
//   1. Discovery — reverse-image lookup "where permitted". We only run a reverse
//      lookup when the user provides a source image AND a permitted, key-
//      authenticated reverse-image API is configured. With no client we return
//      no findings (name-based image search in search.ts still runs); we never
//      scrape image results or evade a provider's access controls.
//
//   2. Takedown generation — turn an image hit into a ready-to-send takedown
//      request routed to the correct published channel for its host: Google's
//      "Remove images of yourself" tool for search results, a platform's own
//      report/takedown form for known social hosts, or the host's published
//      DMCA/abuse contact (plus a Google de-index request) for everything else.
//      We generate the request the user reviews and submits; we never auto-
//      submit or impersonate the user beyond what the published form asks for.

import { randomUUID } from "node:crypto";
import type { Finding, TakedownRequest } from "../types.js";

// ---------------------------------------------------------------------------
// Reverse-image discovery seam
// ---------------------------------------------------------------------------

/** One place a reverse-image lookup found the subject's image. */
export interface ReverseImageMatch {
  /** Page the matching image appears on. */
  pageUrl: string;
  /** Direct image URL, when the provider returns one. */
  imageUrl?: string;
  title?: string;
}

/**
 * A permitted, published reverse-image API. Implementations MUST use the
 * vendor's sanctioned API with a valid key and honor its terms/rate limits.
 */
export interface ReverseImageClient {
  /** Look up other places `imageUrl` appears online. */
  lookup(imageUrl: string): Promise<ReverseImageMatch[]>;
}

/**
 * Build a reverse-image client from environment config, or `null` when
 * unconfigured. Mirrors search.ts: no key -> no client -> no reverse lookup.
 *
 *   REVERSE_IMAGE_PROVIDER=<vendor>
 *   REVERSE_IMAGE_API_KEY=<key>
 *
 * No concrete vendor is wired yet (needs a paid key + signed terms — a removal-
 * ops/procurement step). The seam is here so enabling one is config-only and
 * the rest of the flow (takedown generation, tracking) already works today.
 */
export function reverseImageClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ReverseImageClient | null {
  const provider = env.REVERSE_IMAGE_PROVIDER?.trim().toLowerCase();
  const apiKey = env.REVERSE_IMAGE_API_KEY?.trim();
  if (!provider || !apiKey) return null;
  // Add permitted providers here once procurement confirms a key + terms.
  return null;
}

/**
 * Run a reverse-image lookup and map matches to `image` findings. Returns `[]`
 * when there is no client or no source image — the caller reports the reduced
 * coverage; we never fabricate image hits.
 */
export async function reverseImageFindings(
  client: ReverseImageClient | null,
  subjectName: string,
  sourceImageUrl: string | undefined,
): Promise<Finding[]> {
  if (!client || !sourceImageUrl) return [];
  const matches = await client.lookup(sourceImageUrl);
  return matches.map((m): Finding => {
    const host = hostOf(m.pageUrl);
    return {
      id: randomUUID(),
      category: "image",
      source: `Reverse-image match (${host})`,
      title: m.title ?? `Image of ${subjectName} on ${host}`,
      url: m.pageUrl,
      snippet:
        `A reverse-image lookup matched the provided photo of ${subjectName} on ` +
        `${host}. A takedown request has been generated for the host's ` +
        `sanctioned channel.`,
      severity: "medium",
      removable: true,
    };
  });
}

// ---------------------------------------------------------------------------
// Takedown channel routing + request generation
// ---------------------------------------------------------------------------

interface ChannelSpec {
  channel: string;
  channelUrl: string;
  method: TakedownRequest["method"];
  /** Builds the request body for a given host page + subject. */
  body: (subjectName: string, host: string, targetUrl?: string) => string;
}

// Known social/media hosts with their own published image report/takedown form.
// Keep conservative: only hosts whose takedown channel is publicly documented.
const PLATFORM_CHANNELS: Record<string, ChannelSpec> = {
  "instagram.com": platform(
    "Instagram",
    "https://help.instagram.com/contact/504521742987441",
  ),
  "facebook.com": platform(
    "Facebook",
    "https://www.facebook.com/help/contact/144059062408922",
  ),
  "x.com": platform("X (Twitter)", "https://help.x.com/en/forms/private-information"),
  "twitter.com": platform(
    "X (Twitter)",
    "https://help.x.com/en/forms/private-information",
  ),
  "tiktok.com": platform(
    "TikTok",
    "https://www.tiktok.com/legal/report/privacy",
  ),
  "linkedin.com": platform(
    "LinkedIn",
    "https://www.linkedin.com/help/linkedin/ask/TS-NIPR",
  ),
  "reddit.com": platform(
    "Reddit",
    "https://www.reddit.com/report?reason=personal-and-confidential-information",
  ),
  "pinterest.com": platform(
    "Pinterest",
    "https://help.pinterest.com/en/article/report-something-on-pinterest",
  ),
  "tumblr.com": platform(
    "Tumblr",
    "https://www.tumblr.com/abuse/privacy",
  ),
};

// Google search-results surfaces: route to the personal-image removal tool.
const GOOGLE_HOSTS = [
  "google.com",
  "googleusercontent.com",
  "gstatic.com",
  "ggpht.com",
];

const GOOGLE_CHANNEL: ChannelSpec = {
  channel: "Google — Remove images of yourself",
  channelUrl: "https://support.google.com/websearch/answer/12719076",
  method: "search_console",
  body: (name, host, target) =>
    [
      `I am requesting removal of an image of me, ${name}, from Google Search ` +
        `results.`,
      target ? `Target URL: ${target}` : `Host: ${host}`,
      ``,
      `This image appears in search results for my name and I am the subject. ` +
        `Please remove it under Google's policy for removing personal images ` +
        `(including where the image can be used to identify or contact me).`,
    ].join("\n"),
};

// Fallback for any other host: request removal from the host directly via its
// published abuse/DMCA channel, and de-index from Google in parallel.
function genericChannel(host: string): ChannelSpec {
  return {
    channel: `Host takedown (${host}) + Google de-index`,
    channelUrl: `https://support.google.com/websearch/troubleshooter/3111061`,
    method: "web_form",
    body: (name, h, target) =>
      [
        `To the site administrator / abuse contact for ${h}:`,
        ``,
        `I am requesting removal of an image of me, ${name}, hosted at:`,
        target ? `  ${target}` : `  (image on ${h})`,
        ``,
        `I am the subject of this image and did not consent to its publication. ` +
          `Please remove it. If the image is my copyrighted work, treat this as ` +
          `a DMCA takedown notice.`,
        ``,
        `In parallel, I am requesting Google de-index the URL via the outdated-` +
          `content / personal-content removal tool.`,
      ].join("\n"),
  };
}

/**
 * Resolve the correct SANCTIONED takedown channel for an image finding and
 * generate a ready-to-send request. This is the STA-6 payload: an image hit ->
 * a concrete, reviewable takedown request tied to a real published channel.
 */
export function resolveImageTakedown(
  finding: { url?: string; source?: string },
  subjectName: string,
): TakedownRequest {
  const host = hostOf(finding.url);
  const spec = channelFor(host);
  return {
    channel: spec.channel,
    channelUrl: spec.channelUrl,
    method: spec.method,
    targetUrl: finding.url,
    subject: `Image takedown request — ${subjectName}`,
    body: spec.body(subjectName, host, finding.url),
  };
}

function channelFor(host: string): ChannelSpec {
  if (GOOGLE_HOSTS.some((g) => host === g || host.endsWith(`.${g}`))) {
    return GOOGLE_CHANNEL;
  }
  for (const [domain, spec] of Object.entries(PLATFORM_CHANNELS)) {
    if (host === domain || host.endsWith(`.${domain}`)) return spec;
  }
  return genericChannel(host);
}

function platform(name: string, url: string): ChannelSpec {
  return {
    channel: `${name} — report/takedown form`,
    channelUrl: url,
    method: "web_form",
    body: (subjectName, host, target) =>
      [
        `I am requesting removal of an image of me, ${subjectName}, on ${name}.`,
        target ? `Content URL: ${target}` : `Host: ${host}`,
        ``,
        `I am the subject of this image and am requesting its removal under ` +
          `${name}'s privacy / non-consensual imagery policy.`,
      ].join("\n"),
  };
}

/** Bare hostname (no www.) for a URL, or "the host" when unparseable. */
function hostOf(url: string | undefined): string {
  if (!url) return "the host";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the host";
  }
}
