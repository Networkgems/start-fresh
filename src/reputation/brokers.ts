/**
 * Curated registry of major US data brokers / people-search directories.
 *
 * Every URL here is either a broker's own PUBLIC people-search page or its
 * PUBLISHED opt-out page. We only ever construct links to these public pages —
 * we do not scrape them, log in, or evade any access control. The opt-out URLs
 * are the actionable payload the removal workflow (STA-5) consumes.
 *
 * Sources for the opt-out URLs are the brokers' own published privacy pages,
 * the same set consumer privacy services rely on. Keep this list conservative:
 * only include a broker when its opt-out channel is publicly documented.
 */

/**
 * How the broker's PUBLISHED opt-out is submitted.
 *   web_form — the opt-out is completed on the broker's own removal page.
 *   email    — the broker documents an email address for opt-out requests.
 * We never auto-submit or evade access controls; this only tells the removal
 * workflow which published channel a request is prepared for.
 */
export type OptOutMethod = "web_form" | "email";

export interface BrokerDirectory {
  /** Stable id (kebab-case). */
  id: string;
  name: string;
  /** Broker home page. */
  homeUrl: string;
  /**
   * Published opt-out / removal page. This is what STA-5 acts on.
   * Some brokers only offer email/phone opt-out; we still link the page that
   * documents the process.
   */
  optOutUrl: string;
  /** Which published channel the opt-out request is prepared for. */
  optOutMethod: OptOutMethod;
  /**
   * Documented opt-out email address, when `optOutMethod` is "email". This is
   * the address the broker itself publishes for removal requests.
   */
  optOutEmail?: string;
  /**
   * Template for the broker's PUBLIC name-search page, if it exposes a stable
   * URL pattern. `{first}`, `{last}`, `{name}` (space-joined), and `{slug}`
   * (hyphen-joined, lowercased) are substituted. `null` when the broker has no
   * documented public search URL pattern (search is still available on-site).
   */
  searchUrlTemplate: string | null;
}

/**
 * The registry. Deliberately curated (not exhaustive) — a dozen of the most
 * widely-listed US brokers. Extend as removal ops confirms opt-out channels.
 */
export const BROKER_DIRECTORY: readonly BrokerDirectory[] = [
  {
    id: "spokeo",
    name: "Spokeo",
    homeUrl: "https://www.spokeo.com",
    optOutUrl: "https://www.spokeo.com/optout",
    optOutMethod: "web_form",
    searchUrlTemplate: "https://www.spokeo.com/{slug}",
  },
  {
    id: "whitepages",
    name: "Whitepages",
    homeUrl: "https://www.whitepages.com",
    optOutUrl: "https://www.whitepages.com/suppression-requests",
    optOutMethod: "web_form",
    searchUrlTemplate: "https://www.whitepages.com/name/{slug}",
  },
  {
    id: "beenverified",
    name: "BeenVerified",
    homeUrl: "https://www.beenverified.com",
    optOutUrl: "https://www.beenverified.com/app/optout/search",
    optOutMethod: "web_form",
    searchUrlTemplate: null,
  },
  {
    id: "intelius",
    name: "Intelius",
    homeUrl: "https://www.intelius.com",
    optOutUrl: "https://www.intelius.com/opt-out",
    optOutMethod: "web_form",
    searchUrlTemplate: null,
  },
  {
    id: "truepeoplesearch",
    name: "TruePeopleSearch",
    homeUrl: "https://www.truepeoplesearch.com",
    optOutUrl: "https://www.truepeoplesearch.com/removal",
    optOutMethod: "web_form",
    searchUrlTemplate:
      "https://www.truepeoplesearch.com/results?name={name}",
  },
  {
    id: "fastpeoplesearch",
    name: "FastPeopleSearch",
    homeUrl: "https://www.fastpeoplesearch.com",
    optOutUrl: "https://www.fastpeoplesearch.com/removal",
    optOutMethod: "web_form",
    searchUrlTemplate: "https://www.fastpeoplesearch.com/name/{slug}",
  },
  {
    id: "mylife",
    name: "MyLife",
    homeUrl: "https://www.mylife.com",
    optOutUrl: "https://www.mylife.com/ccpa/index.pubview",
    optOutMethod: "web_form",
    searchUrlTemplate: null,
  },
  {
    id: "peoplefinders",
    name: "PeopleFinders",
    homeUrl: "https://www.peoplefinders.com",
    optOutUrl: "https://www.peoplefinders.com/opt-out",
    optOutMethod: "web_form",
    searchUrlTemplate: null,
  },
  {
    id: "radaris",
    name: "Radaris",
    homeUrl: "https://radaris.com",
    optOutUrl: "https://radaris.com/control/privacy",
    optOutMethod: "web_form",
    searchUrlTemplate: null,
  },
  {
    id: "ussearch",
    name: "US Search",
    homeUrl: "https://www.ussearch.com",
    optOutUrl: "https://www.ussearch.com/opt-out",
    optOutMethod: "web_form",
    searchUrlTemplate: null,
  },
  {
    id: "instantcheckmate",
    name: "Instant Checkmate",
    homeUrl: "https://www.instantcheckmate.com",
    optOutUrl: "https://www.instantcheckmate.com/opt-out",
    optOutMethod: "web_form",
    searchUrlTemplate: null,
  },
  {
    id: "nuwber",
    name: "Nuwber",
    homeUrl: "https://nuwber.com",
    optOutUrl: "https://nuwber.com/removal/link",
    optOutMethod: "web_form",
    searchUrlTemplate: null,
  },
];

/** Lookup a broker by its stable id. */
const BY_ID: ReadonlyMap<string, BrokerDirectory> = new Map(
  BROKER_DIRECTORY.map((b) => [b.id, b]),
);

export function brokerById(id: string): BrokerDirectory | undefined {
  return BY_ID.get(id);
}
