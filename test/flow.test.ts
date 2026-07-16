import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

// Extracts the sf_session cookie from a Set-Cookie header for reuse.
function sessionCookie(res: request.Response): string {
  const raw = res.headers["set-cookie"];
  const arr = Array.isArray(raw) ? raw : [raw];
  const cookie = arr.find((c) => c?.startsWith("sf_session="));
  if (!cookie) throw new Error("no session cookie set");
  return cookie.split(";")[0];
}

describe("auth", () => {
  it("rejects weak passwords on signup", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "a@b.com", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("weak_password");
  });

  it("signs up, sets a session, and rejects duplicate email", async () => {
    const email = `user_${Date.now()}@example.com`;
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email, password: "supersecret" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(sessionCookie(res)).toContain("sf_session=");

    const dup = await request(app)
      .post("/api/auth/signup")
      .send({ email, password: "supersecret" });
    expect(dup.status).toBe(409);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    const email = `login_${Date.now()}@example.com`;
    await request(app).post("/api/auth/signup").send({ email, password: "supersecret" });

    const good = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "supersecret" });
    expect(good.status).toBe(200);

    const bad = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "wrongpass1" });
    expect(bad.status).toBe(401);
  });

  it("blocks unauthenticated access to cases", async () => {
    const res = await request(app).get("/api/cases");
    expect(res.status).toBe(401);
  });
});

describe("end-to-end reputation flow", () => {
  it("signs up -> submits a name -> gets report + removals -> advances a removal", async () => {
    const email = `flow_${Date.now()}@example.com`;
    const signup = await request(app)
      .post("/api/auth/signup")
      .send({ email, password: "supersecret" });
    const cookie = sessionCookie(signup);

    // Submit a name -> case + report + removals.
    const created = await request(app)
      .post("/api/cases")
      .set("Cookie", cookie)
      .send({ name: "Jane Doe" });
    expect(created.status).toBe(201);
    expect(created.body.report.findings.length).toBeGreaterThan(0);
    expect(created.body.report.score).toBeGreaterThanOrEqual(5);
    expect(created.body.report.score).toBeLessThanOrEqual(100);
    expect(created.body.removals.length).toBeGreaterThan(0);
    const caseId = created.body.case.id;

    // Deterministic report: same name -> same score.
    const again = await request(app)
      .post("/api/cases")
      .set("Cookie", cookie)
      .send({ name: "Jane Doe" });
    expect(again.body.report.score).toBe(created.body.report.score);

    // List includes the case.
    const list = await request(app).get("/api/cases").set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(list.body.cases.length).toBeGreaterThanOrEqual(2);

    // Advance a removal through its lifecycle.
    const removal = created.body.removals[0];
    expect(removal.status).toBe("pending");
    const adv = async (to?: string) =>
      request(app)
        .post(`/api/cases/${caseId}/removals/${removal.id}/advance`)
        .set("Cookie", cookie)
        .send(to ? { to } : {});

    expect((await adv()).body.removal.status).toBe("submitted");
    expect((await adv()).body.removal.status).toBe("in_progress");
    const removed = await adv();
    expect(removed.body.removal.status).toBe("removed");
    expect(removed.body.removal.history.length).toBe(4);

    // Terminal -> further advance is rejected.
    expect((await adv()).status).toBe(409);
  });

  it("does not leak another user's case", async () => {
    const a = await request(app)
      .post("/api/auth/signup")
      .send({ email: `owner_${Date.now()}@example.com`, password: "supersecret" });
    const cookieA = sessionCookie(a);
    const c = await request(app)
      .post("/api/cases")
      .set("Cookie", cookieA)
      .send({ name: "Owned Person" });
    const caseId = c.body.case.id;

    const b = await request(app)
      .post("/api/auth/signup")
      .send({ email: `intruder_${Date.now()}@example.com`, password: "supersecret" });
    const cookieB = sessionCookie(b);
    const res = await request(app).get(`/api/cases/${caseId}`).set("Cookie", cookieB);
    expect(res.status).toBe(404);
  });
});
