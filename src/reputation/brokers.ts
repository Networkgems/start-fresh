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
    searchUrlTemplate: "https://www.spokeo.com/{slug}",
  },
  {
    id: "whitepages",
    name: "Whitepages",
    homeUrl: "https://www.whitepages.com",
    optOutUrl: "https://www.whitepages.com/suppression-requests",
    searchUrlTemplate: "https://www.whitepages.com/name/{slug}",
  },
  {
    id: "beenverified",
    name: "BeenVerified",
    homeUrl: "https://www.beenverified.com",
    optOutUrl: "https://www.beenverified.com/app/optout/search",
    searchUrlTemplate: null,
  },
  {
    id: "intelius",
    name: "Intelius",
    homeUrl: "https://www.intelius.com",
    optOutUrl: "https://www.intelius.com/opt-out",
    searchUrlTemplate: null,
  },
  {
    id: "truepeoplesearch",
    name: "TruePeopleSearch",
    homeUrl: "https://www.truepeoplesearch.com",
    optOutUrl: "https://www.truepeoplesearch.com/removal",
    searchUrlTemplate:
      "https://www.truepeoplesearch.com/results?name={name}",
  },
  {
    id: "fastpeoplesearch",
    name: "FastPeopleSearch",
    homeUrl: "https://www.fastpeoplesearch.com",
    optOutUrl: "https://www.fastpeoplesearch.com/removal",
    searchUrlTemplate: "https://www.fastpeoplesearch.com/name/{slug}",
  },
  {
    id: "mylife",
    name: "MyLife",
    homeUrl: "https://www.mylife.com",
    optOutUrl: "https://www.mylife.com/ccpa/index.pubview",
    searchUrlTemplate: null,
  },
  {
    id: "peoplefinders",
    name: "PeopleFinders",
    homeUrl: "https://www.peoplefinders.com",
    optOutUrl: "https://www.peoplefinders.com/opt-out",
    searchUrlTemplate: null,
  },
  {
    id: "radaris",
    name: "Radaris",
    homeUrl: "https://radaris.com",
    optOutUrl: "https://radaris.com/control/privacy",
    searchUrlTemplate: null,
  },
  {
    id: "ussearch",
    name: "US Search",
    homeUrl: "https://www.ussearch.com",
    optOutUrl: "https://www.ussearch.com/opt-out",
    searchUrlTemplate: null,
  },
  {
    id: "instantcheckmate",
    name: "Instant Checkmate",
    homeUrl: "https://www.instantcheckmate.com",
    optOutUrl: "https://www.instantcheckmate.com/opt-out",
    searchUrlTemplate: null,
  },
  {
    id: "nuwber",
    name: "Nuwber",
    homeUrl: "https://nuwber.com",
    optOutUrl: "https://nuwber.com/removal/link",
    searchUrlTemplate: null,
  },
];
