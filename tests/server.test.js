/**
 * AgentDash Server — integration tests
 * Uses supertest to hit the REST API against a real in-process server.
 */

process.env.DATA_DIR = "/tmp/agentdash-test-db-" + Date.now();

const request = require("supertest");
const { app, server } = require("../server/index");

afterAll(() => server.close());

// ── /stats ────────────────────────────────────────────────────────────────────

describe("GET /stats", () => {
  it("returns aggregate stats", async () => {
    const res = await request(app).get("/stats");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total:        expect.any(Number),
      active:       expect.any(Number),
      tokens:       expect.any(Number),
      recentEvents: expect.any(Array),
    });
  });
});

// ── /runs CRUD ────────────────────────────────────────────────────────────────

describe("Runs CRUD", () => {
  let runId;

  it("POST /runs creates a run", async () => {
    const res = await request(app).post("/runs").send({ agentName: "test-agent" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ agentName: "test-agent", status: "running" });
    runId = res.body.id;
  });

  it("GET /runs lists runs", async () => {
    const res = await request(app).get("/runs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.find((r) => r.id === runId)).toBeTruthy();
  });

  it("GET /runs/:id returns run with events", async () => {
    const res = await request(app).get(`/runs/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(runId);
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it("GET /runs/:id 404 for unknown run", async () => {
    const res = await request(app).get("/runs/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("DELETE /runs/:id deletes the run", async () => {
    const res = await request(app).delete(`/runs/${runId}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const check = await request(app).get(`/runs/${runId}`);
    expect(check.status).toBe(404);
  });
});

// ── POST /runs validation ────────────────────────────────────────────────────

describe("POST /runs validation", () => {
  it("returns 400 if agentName is missing", async () => {
    const res = await request(app).post("/runs").send({});
    expect(res.status).toBe(400);
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("Auth middleware", () => {
  const OLD_KEY = process.env.AGENTDASH_API_KEY;

  afterEach(() => {
    process.env.AGENTDASH_API_KEY = OLD_KEY;
  });

  it("allows all requests when no API key is set", async () => {
    delete process.env.AGENTDASH_API_KEY;
    const res = await request(app).get("/stats");
    expect(res.status).toBe(200);
  });
});

// ── Bulk delete ───────────────────────────────────────────────────────────────

describe("DELETE /runs bulk", () => {
  it("returns deleted count", async () => {
    const res = await request(app).delete("/runs?olderThan=0");
    expect(res.status).toBe(200);
    expect(typeof res.body.deleted).toBe("number");
  });
});
