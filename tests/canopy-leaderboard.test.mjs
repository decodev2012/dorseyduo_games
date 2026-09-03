import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const moduleSource = await readFile(new URL("../functions/api/v1/canopy-caliber/leaderboard.js", import.meta.url), "utf8");
const {
  isOriginAllowed,
  normalizePlayerName,
  onRequestGet,
  onRequestOptions,
  onRequestPost,
  validateSubmission,
} = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`);

const ORIGIN = "https://decodev2012.github.io";

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql.replace(/\s+/g, " ").trim(); this.values = []; }
  bind(...values) { this.values = values; return this; }
  async run() {
    if (!this.sql.startsWith("INSERT INTO")) throw new Error(`Unexpected run: ${this.sql}`);
    const [id, board_version, client_run_id, player_name, time_ms, score, health, skin_id, weapon_id, created_at_ms] = this.values;
    if (this.db.rows.some(row => row.client_run_id === client_run_id)) return { meta: { changes: 0 } };
    this.db.rows.push({ id, board_version, client_run_id, player_name, time_ms, score, health, skin_id, weapon_id, created_at_ms, sequence: this.db.nextSequence++ });
    return { meta: { changes: 1 } };
  }
  async first() {
    if (this.sql.includes("client_run_id = ?")) return this.db.rows.find(row => row.board_version === this.values[0] && row.client_run_id === this.values[1]) || null;
    if (this.sql.includes("COUNT(*) + 1 AS rank")) {
      const id = this.values.at(-1);
      const rank = this.db.sorted().findIndex(row => row.id === id) + 1;
      return { rank: rank || 1 };
    }
    throw new Error(`Unexpected first: ${this.sql}`);
  }
  async all() {
    if (!this.sql.includes("FROM canopy_caliber_runs")) throw new Error(`Unexpected all: ${this.sql}`);
    return { results: this.db.sorted().filter(row => row.board_version === this.values[0]).slice(0, this.values.at(-1)) };
  }
}

class FakeD1 {
  constructor() { this.rows = []; this.nextSequence = 1; }
  prepare(sql) { return new FakeStatement(this, sql); }
  sorted() {
    return [...this.rows].sort((a, b) => a.time_ms - b.time_ms || b.score - a.score || b.health - a.health || a.sequence - b.sequence || a.id.localeCompare(b.id));
  }
}

function submission(overrides = {}) {
  return {
    version: 1,
    clientRunId: "run-test-0001",
    playerName: "Jungle Ace",
    timeMs: 73456,
    score: 28120,
    health: 87,
    skinId: "shadow",
    weaponId: "pistol",
    ...overrides,
  };
}

function request(method, body, origin = ORIGIN) {
  const headers = { Origin: origin };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request("https://dorseyduo-games.pages.dev/api/v1/canopy-caliber/leaderboard", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("origin policy allows the game and local development only", () => {
  assert.equal(isOriginAllowed(ORIGIN), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:8765"), true);
  assert.equal(isOriginAllowed("https://evil.example"), false);
  assert.equal(isOriginAllowed(""), false);
});

test("nicknames are normalized and submissions are strictly validated", () => {
  assert.equal(normalizePlayerName("  Jungle   Ace  "), "Jungle Ace");
  assert.equal(validateSubmission(submission()).ok, true);
  assert.equal(validateSubmission(submission({ weaponId: "shotgun" })).ok, true);
  assert.equal(validateSubmission(submission({ weaponId: "ghost" })).ok, true);
  assert.equal(validateSubmission(submission({ playerName: "<script>" })).code, "invalid_player_name");
  assert.equal(validateSubmission(submission({ weaponId: "laser" })).code, "invalid_weapon");
  assert.equal(validateSubmission(submission({ timeMs: 1.5 })).code, "invalid_time");
  assert.equal(validateSubmission(submission({ timeMs: 9999 })).code, "invalid_time");
  assert.equal(validateSubmission(submission({ score: 100001 })).code, "invalid_score");
  assert.equal(validateSubmission(submission({ secretExtra: true })).code, "unknown_field");
});

test("preflight rejects unknown sites and accepts the live game", async () => {
  const accepted = await onRequestOptions({ request: request("OPTIONS") });
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  const rejected = await onRequestOptions({ request: request("OPTIONS", undefined, "https://evil.example") });
  assert.equal(rejected.status, 403);
});

test("POST is idempotent, rejects changed duplicate data, and GET returns ranked entries", async () => {
  const db = new FakeD1();
  const first = await onRequestPost({ request: request("POST", submission()), env: { CANOPY_DB: db } });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.rank, 1);
  assert.equal(firstBody.entry.playerName, "Jungle Ace");

  const retry = await onRequestPost({ request: request("POST", submission()), env: { CANOPY_DB: db } });
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal(db.rows.length, 1);

  const conflict = await onRequestPost({ request: request("POST", submission({ score: 1 })), env: { CANOPY_DB: db } });
  assert.equal(conflict.status, 409);

  await onRequestPost({ request: request("POST", submission({ clientRunId: "run-test-0002", playerName: "Speedy", timeMs: 60000 })), env: { CANOPY_DB: db } });
  const result = await onRequestGet({ request: request("GET"), env: { CANOPY_DB: db } });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.entries.map(entry => entry.playerName), ["Speedy", "Jungle Ace"]);
  assert.deepEqual(body.entries.map(entry => entry.rank), [1, 2]);
});

test("missing storage fails safely without breaking local records", async () => {
  const response = await onRequestGet({ request: request("GET"), env: {} });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "leaderboard_unavailable");
});
