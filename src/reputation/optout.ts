// Data-broker opt-out request generation (STA-5).
//
// Turns a `data_broker` finding into a ready-to-submit opt-out request routed to
// the broker's OWN published channel — either its removal web form or its
// documented opt-out email. We generate the request the user (or removal ops)
// reviews and submits through that published channel; we never auto-submit,
// scrape, log in, or evade any access control, and the request only asserts the
// subject's own removal rights (CCPA/CPRA-style) — no impersonation beyond what a
// published opt-out form legitimately requires.
//
// This is the actionable payload the removal tracker (removals.ts) attaches to a
// broker removal so its status can be advanced to completion.

import { parseName } from "./name.js";
import type { BrokerDirectory } from "./brokers.js";
import type { OptOutRequest } from "../types.js";

/**
 * Build a templated opt-out request for a broker listing.
 *
 * @param broker      registry entry with the broker's PUBLISHED opt-out channel
 * @param subjectName the person whose listing we're asking the broker to remove
 * @param listingUrl  the broker's public listing/search URL for the subject
 */
export function buildOptOutRequest(
  broker: BrokerDirectory,
  subjectName: string,
  listingUrl?: string,
): OptOutRequest {
  const name = parseName(subjectName).full || subjectName.trim();
  return {
    brokerId: broker.id,
    brokerName: broker.name,
    method: broker.optOutMethod,
    channelUrl: broker.optOutUrl,
    channelEmail: broker.optOutMethod === "email" ? broker.optOutEmail : undefined,
    listingUrl,
    subject: `Opt-out / personal information removal request — ${name}`,
    body: requestBody(broker, name, listingUrl),
  };
}

/**
 * The request text. Kept factual and rights-based: it names the subject and the
 * listing to remove, invokes the broker's published opt-out process and the
 * subject's statutory removal/do-not-sell rights, and asks for confirmation. It
 * does NOT fabricate identifiers or claim to be anyone other than the subject
 * exercising their own opt-out — exactly what a published opt-out form asks for.
 */
function requestBody(
  broker: BrokerDirectory,
  name: string,
  listingUrl?: string,
): string {
  const salutation =
    broker.optOutMethod === "email"
      ? `To the ${broker.name} Privacy Team,`
      : `${broker.name} opt-out request`;
  return [
    salutation,
    ``,
    `I am requesting the removal of my personal information from ${broker.name} ` +
      `and any affiliated people-search directories, through your published ` +
      `opt-out process.`,
    ``,
    `Subject of the request: ${name}`,
    listingUrl ? `Listing to remove: ${listingUrl}` : `Listing: (see attached / on-file record)`,
    ``,
    `I am the subject of this record and I am exercising my right to opt out of ` +
      `the sale and sharing of my personal information and to have this record ` +
      `removed (including under the CCPA/CPRA and comparable state privacy laws ` +
      `where applicable). Please remove the listing above, suppress future ` +
      `re-listing where your process allows, and confirm once completed.`,
    ``,
    `Thank you.`,
  ].join("\n");
}
