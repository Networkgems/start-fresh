// Social-media disconnect / de-link guidance (STA-7).
//
// When the reputation scan surfaces a `social` finding we turn it into a tracked
// "disconnect" removal carrying concrete, platform-specific guidance: how to make
// the profile private, deactivate, or delete it, plus links to each platform's
// PUBLISHED, self-service account controls.
//
// PRIVACY / SAFETY: social platforms do not offer a sanctioned third-party API to
// delete or de-link someone's account, and we never automate account actions or
// impersonate the user. The sanctioned path is user-driven self-service through
// the platform's own published controls (which we link and walk them through),
// with a search-engine de-index request as the fallback for public results the
// user does not control (that suppression path is STA-10). Keep this registry to
// published control pages only; removal ops can refine the exact URLs.

import type { DisconnectControl, DisconnectGuidance } from "../types.js";

export interface SocialPlatform {
  /** Stable id (kebab-case). */
  id: string;
  name: string;
  /** Hostnames (lowercased, no leading `www.`) that identify this platform. */
  hosts: string[];
  /** Published self-service controls, most-private / most-final action first. */
  controls: DisconnectControl[];
  /** Guided disconnect steps, ordered least-destructive (make private) first. */
  steps: string[];
}

/**
 * Curated registry of the platforms the open-web social scan targets
 * (see SOCIAL_SITES in reputation/search.ts). Every URL is the platform's own
 * PUBLISHED settings or help page — the sanctioned self-service channel. We only
 * link these pages; we never log in, automate, or act on the user's behalf.
 */
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  {
    id: "linkedin",
    name: "LinkedIn",
    hosts: ["linkedin.com"],
    controls: [
      { label: "Privacy & visibility settings", url: "https://www.linkedin.com/psettings/" },
      { label: "Close your account", url: "https://www.linkedin.com/help/linkedin/answer/a1339648" },
    ],
    steps: [
      "Sign in to LinkedIn and open Settings & Privacy → Visibility, then set your profile visibility and public profile to connections-only or off.",
      "Under Visibility → 'Profile discovery and communication settings', turn off discovery by email/phone so you don't surface in search.",
      "To fully de-link, open the 'Close your account' help page and follow the account-closure flow.",
    ],
  },
  {
    id: "facebook",
    name: "Facebook",
    hosts: ["facebook.com", "fb.com", "fb.watch"],
    controls: [
      { label: "Privacy settings", url: "https://www.facebook.com/settings?tab=privacy" },
      { label: "Deactivate or delete account", url: "https://www.facebook.com/help/224562897555674" },
    ],
    steps: [
      "In Settings & Privacy → Settings → Privacy, set 'Who can see your future posts' and profile fields to Friends or Only me.",
      "Under 'How people find and contact you', turn off the setting that lets search engines outside Facebook link to your profile.",
      "To remove the profile, use Deactivate (temporary, reversible) or Delete (permanent) from the account help page.",
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    hosts: ["instagram.com"],
    controls: [
      { label: "Delete your account", url: "https://www.instagram.com/accounts/remove/request/permanent/" },
      { label: "Temporarily deactivate", url: "https://www.instagram.com/accounts/remove/request/temporary/" },
    ],
    steps: [
      "Open Settings → Account privacy and switch your account to Private so only approved followers see your posts.",
      "Under Settings → Privacy, restrict tags, mentions, and who can find you by phone or email.",
      "To remove the profile, temporarily deactivate it, or use the permanent deletion page when you're ready.",
    ],
  },
  {
    id: "x",
    name: "X (Twitter)",
    hosts: ["x.com", "twitter.com", "t.co"],
    controls: [
      { label: "Audience & tagging (protect posts)", url: "https://x.com/settings/audience_and_tagging" },
      { label: "Deactivate your account", url: "https://x.com/settings/deactivate" },
    ],
    steps: [
      "In Settings → Privacy and safety → Audience and tagging, enable 'Protect your posts' so only approved followers can see them.",
      "In Settings → Privacy and safety → Discoverability, turn off finding you by email and phone number.",
      "To remove the profile, deactivate your account — there's a 30-day window before it's permanently deleted.",
    ],
  },
  {
    id: "tiktok",
    name: "TikTok",
    hosts: ["tiktok.com"],
    controls: [
      { label: "Privacy settings", url: "https://support.tiktok.com/en/account-and-privacy/account-privacy-settings" },
      { label: "Delete your account", url: "https://support.tiktok.com/en/account-and-privacy/deleting-an-account" },
    ],
    steps: [
      "In Settings and privacy → Privacy, switch to a Private account so only approved followers see your videos.",
      "Restrict who can find you, comment, Duet/Stitch, and download your videos.",
      "To remove the profile, follow the deletion flow — there's a deactivation window before permanent deletion.",
    ],
  },
];

/** Generic guidance when the profile's platform isn't in the registry. */
const GENERIC_STEPS = [
  "Sign in to the platform and open its privacy settings; set your profile and posts to private or friends-only.",
  "Turn off search-engine indexing and discoverability by email or phone number.",
  "If you no longer use the account, deactivate or delete it from the account settings.",
];

/**
 * Shared honesty note. We can't delete or de-link an account for the user, so we
 * guide the self-service path and, for public results they don't control, fall
 * back to a search-engine de-index request.
 */
const DISCONNECT_NOTE =
  "We can't delete or de-link a social account on your behalf — these are self-service steps you complete " +
  "using the platform's own controls. For a public result you don't control, we can also request search-engine " +
  "de-indexing through your web-suppression items.";

/** Normalize a URL to its registry-comparable hostname, or null. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^(www\.|m\.|mobile\.)/, "");
  } catch {
    return null;
  }
}

/** Identify the social platform a finding URL belongs to, or null. */
export function identifyPlatform(url: string | undefined): SocialPlatform | null {
  const host = hostOf(url);
  if (!host) return null;
  return (
    SOCIAL_PLATFORMS.find((p) =>
      p.hosts.some((h) => host === h || host.endsWith(`.${h}`)),
    ) ?? null
  );
}

/** The result of turning a social finding into a tracked disconnect action. */
export interface SocialDisconnect {
  /** Sanctioned channel label for the removal tracker. */
  channel: string;
  guidance: DisconnectGuidance;
}

/**
 * Build the tracked disconnect action for a `social` finding: a platform-specific
 * channel label plus guided steps and published self-service control links.
 */
export function socialDisconnectFor(finding: { url?: string }): SocialDisconnect {
  const platform = identifyPlatform(finding.url);
  if (platform) {
    return {
      channel: `${platform.name} privacy & account controls`,
      guidance: {
        platform: platform.name,
        steps: platform.steps,
        controls: platform.controls,
        note: DISCONNECT_NOTE,
      },
    };
  }
  return {
    channel: "Platform privacy / account controls",
    guidance: {
      platform: "Social profile",
      steps: GENERIC_STEPS,
      controls: [],
      note: DISCONNECT_NOTE,
    },
  };
}
