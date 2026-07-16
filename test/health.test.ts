import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("GET /api/health", () => {
  it("returns 200 with ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("start-fresh");
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });
});

describe("GET /", () => {
  it("serves the landing page", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("Start Fresh");
  });
});

describe("unknown route", () => {
  it("returns 404", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
