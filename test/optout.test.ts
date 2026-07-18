import { describe, it, expect } from "vitest";
import { generateReport } from "../src/report.js";
import { deriveRemovals, advanceRemoval } from "../src/removals.js";
import { buildOptOutRequest } from "../src/reputation/optout.js";
import { BROKER_DIRECTORY, brokerById } from "../src/reputation/brokers.js";
import type { BrokerDirectory } from "../src/reputation/brokers.js";

describe("buildOptOutRequest — templated data-broker opt-out", () => {
  it("targets the broker's published web-form channel and asserts only the subject's rights", () => {
    const spokeo = brokerById("spokeo")!;
    const req = buildOptOutRequest(spokeo, "Jane Q Doe", "https://www.spokeo.com/jane-q-doe");

    expect(req.brokerId).toBe("spokeo");
    expect(req.brokerName).toBe("Spokeo");
    expect(req.method).toBe("web_form");
    // Routed to the broker's OWN published opt-out page — never a scrape target.
    expect(req.channelUrl).toBe(spokeo.optOutUrl);
    expect(req.channelEmail).toBeUndefined();
    expect(req.listingUrl).toBe("https://www.spokeo.com/jane-q-doe");
    // The request names the subject and invokes their own removal rights only.
    expect(req.subject).toContain("Jane Q Doe");
    expect(req.body).toContain("Jane Q Doe");
    expect(req.body).toContain("I am the subject");
    expect(req.body.toLowerCase()).toContain("opt out");
  });

  it("routes an email-opt-out broker to its published address", () => {
    const emailBroker: BrokerDirectory = {
      id: "example-broker",
      name: "Example Broker",
      homeUrl: "https://example.com",
      optOutUrl: "https://example.com/privacy",
      optOutMethod: "email",
      optOutEmail: "privacy@example.com",
      searchUrlTemplate: null,
    };
    const req = buildOptOutRequest(emailBroker, "John Smith");
    expect(req.method).toBe("email");
    expect(req.channelEmail).toBe("privacy@example.com");
    expect(req.body).toContain("Privacy Team");
  });
});

describe("broker registry — B2B / contact-data brokers", () => {
  // These are the brokers the removal-ops sweep targets; each must resolve to its
  // verified PUBLISHED opt-out channel so the workflow routes requests correctly.
  const B2B: Array<[string, string, string]> = [
    ["zoominfo", "ZoomInfo", "https://privacyrequest.zoominfo.com/remove/verify"],
    ["signalhire", "SignalHire", "https://www.signalhire.com/opt-out"],
    ["wiza", "Wiza", "https://wiza.co/optout-contact-info"],
  ];

  it.each(B2B)("registers %s with its published opt-out URL and generates a request", (id, name, optOutUrl) => {
    const broker = brokerById(id);
    expect(broker).toBeDefined();
    expect(broker!.name).toBe(name);
    expect(broker!.optOutUrl).toBe(optOutUrl);

    const req = buildOptOutRequest(broker!, "Enock Etienne");
    expect(req.channelUrl).toBe(optOutUrl);
    expect(req.method).toBe("web_form");
    expect(req.body).toContain("Enock Etienne");
  });
});

describe("deriveRemovals — data-broker removals carry a submittable request", () => {
  it("attaches an opt-out request to every broker removal and can transition it to completion", async () => {
    const report = await generateReport("Data Subject", "case-optout", { searchClient: null });
    const removals = deriveRemovals(report);

    const brokerRemovals = removals.filter((r) => r.category === "data_broker");
    expect(brokerRemovals.length).toBe(BROKER_DIRECTORY.length);

    for (const r of brokerRemovals) {
      expect(r.optOut).toBeDefined();
      // The request points at a real registered broker's published opt-out page.
      const broker = brokerById(r.optOut!.brokerId);
      expect(broker).toBeDefined();
      expect(r.optOut!.channelUrl).toBe(broker!.optOutUrl);
      // Channel label names the broker so the tracker shows where it was sent.
      expect(r.channel).toContain(broker!.name);
      // Fresh removals start pending with the request ready to submit.
      expect(r.status).toBe("pending");
    }

    // A report item becomes a tracked request that transitions to completion.
    const one = brokerRemovals[0];
    const step = (): string => {
      const r = advanceRemoval(one.id);
      if (!r.ok) throw new Error(r.error);
      // The generated request survives each status transition.
      expect(r.removal.optOut?.brokerId).toBe(one.optOut!.brokerId);
      return r.removal.status;
    };
    expect(step()).toBe("submitted");
    expect(step()).toBe("in_progress");
    expect(step()).toBe("removed");
    // Terminal -> further advance is rejected.
    expect(advanceRemoval(one.id).ok).toBe(false);
  });
});
