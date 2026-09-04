const VERSION = 1;
const MAX_BODY_BYTES = 4096;
const MAX_ENTRIES = 10;
const MIN_RUN_TIME_MS = 10000;
const MAX_RUN_SCORE = 100000;
const ALLOWED_SKINS = new Set(["classic", "sunset", "frost", "shadow", "neon", "golden"]);
const ALLOWED_WEAPONS = new Set(["pistol", "carbine", "shotgun", "ghost"]);
const RESERVED_NAMES = new Set(["admin", "administrator", "moderator", "cloudflare", "canopy caliber"]);
const PRODUCTION_ORIGINS = new Set([
  "https://decodev2012.github.io",
  "https://dorseyduo-games.pages.dev",
  "https://dorseyduo-games-api.pages.dev",
]);

export function isOriginAllowed(origin) {
  if (!origin) return false;
  if (PRODUCTION_ORIGINS.has(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.dorseyduo-games\.pages\.dev$/.test(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (isOriginAllowed(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(request, value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}

function apiError(request, status, code, message, extraHeaders = {}) {
  return json(request, { version: VERSION, error: { code, message } }, status, {
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
}

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function normalizePlayerName(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function validateSubmission(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: "invalid_body", message: "Send one completed run as a JSON object." };
  }
  const allowedFields = new Set(["version", "clientRunId", "playerName", "timeMs", "score", "health", "skinId", "weaponId"]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    return { ok: false, code: "unknown_field", message: "The submission contains an unknown field." };
  }
  if (value.version !== VERSION) {
    return { ok: false, code: "invalid_version", message: "This game version cannot submit to this leaderboard." };
  }
  const clientRunId = typeof value.clientRunId === "string" ? value.clientRunId.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(clientRunId)) {
    return { ok: false, code: "invalid_run_id", message: "The run ID is missing or invalid." };
  }
  const playerName = normalizePlayerName(value.playerName);
  if (!/^[A-Za-z0-9 _-]{2,16}$/.test(playerName) || RESERVED_NAMES.has(playerName.toLowerCase())) {
    return { ok: false, code: "invalid_player_name", message: "Use a 2–16 character nickname with letters, numbers, spaces, _ or -." };
  }
  if (!integer(value.timeMs, MIN_RUN_TIME_MS, 86400000)) {
    return { ok: false, code: "invalid_time", message: "The run time is invalid." };
  }
  if (!integer(value.score, 0, MAX_RUN_SCORE)) {
    return { ok: false, code: "invalid_score", message: "The run score is invalid." };
  }
  if (!integer(value.health, 0, 100)) {
    return { ok: false, code: "invalid_health", message: "The remaining health is invalid." };
  }
  if (!ALLOWED_SKINS.has(value.skinId)) {
    return { ok: false, code: "invalid_skin", message: "The selected skin is invalid." };
  }
  if (!ALLOWED_WEAPONS.has(value.weaponId)) {
    return { ok: false, code: "invalid_weapon", message: "The selected weapon is invalid." };
  }
  return {
    ok: true,
    value: {
      clientRunId,
      playerName,
      timeMs: value.timeMs,
      score: value.score,
      health: value.health,
      skinId: value.skinId,
      weaponId: value.weaponId,
    },
  };
}

function publicEntry(row, rank) {
  return {
    id: row.id,
    playerName: row.player_name,
    timeMs: row.time_ms,
    score: row.score,
    health: row.health,
    skinId: row.skin_id,
    weaponId: row.weapon_id,
    rank,
  };
}

export function comparePublicEntries(a, b) {
  return a.timeMs - b.timeMs || b.score - a.score || b.health - a.health || a.rank - b.rank || a.id.localeCompare(b.id);
}

function entriesEtag(entries) {
  const input = JSON.stringify(entries);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `W/"cc-${(hash >>> 0).toString(16)}"`;
}

async function topEntries(db, limit = MAX_ENTRIES) {
  const result = await db.prepare(`
    SELECT id, player_name, time_ms, score, health, skin_id, weapon_id,
           created_at_ms
    FROM canopy_caliber_runs
    WHERE board_version = ?
    ORDER BY time_ms ASC, score DESC, health DESC, created_at_ms ASC, id ASC
    LIMIT ?
  `).bind(VERSION, limit).all();
  return (result.results || []).map((row, index) => publicEntry(row, index + 1));
}

async function entryRank(db, row) {
  const result = await db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM canopy_caliber_runs
    WHERE board_version = ? AND (
          time_ms < ?
       OR (time_ms = ? AND score > ?)
       OR (time_ms = ? AND score = ? AND health > ?)
       OR (time_ms = ? AND score = ? AND health = ? AND created_at_ms < ?)
       OR (time_ms = ? AND score = ? AND health = ? AND created_at_ms = ? AND id < ?)
    )
  `).bind(
    VERSION,
    row.time_ms,
    row.time_ms, row.score,
    row.time_ms, row.score, row.health,
    row.time_ms, row.score, row.health, row.created_at_ms,
    row.time_ms, row.score, row.health, row.created_at_ms, row.id,
  ).first();
  return Number(result?.rank) || 1;
}

async function checkRateLimit(context) {
  const limiter = context.env.CANOPY_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") return true;
  const address = context.request.headers.get("CF-Connecting-IP") || "anonymous";
  const result = await limiter.limit({ key: address });
  return result?.success !== false;
}

export async function onRequestOptions(context) {
  const origin = context.request.headers.get("Origin") || "";
  if (!isOriginAllowed(origin)) return apiError(context.request, 403, "origin_not_allowed", "This website cannot use the leaderboard.");
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestGet(context) {
  if (!context.env.CANOPY_DB) {
    return apiError(context.request, 503, "leaderboard_unavailable", "The community leaderboard is being set up. Your local records still work.");
  }
  const requestedLimit = Number(new URL(context.request.url).searchParams.get("limit") || MAX_ENTRIES);
  const limit = Math.max(1, Math.min(MAX_ENTRIES, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : MAX_ENTRIES));
  try {
    const entries = await topEntries(context.env.CANOPY_DB, limit);
    const etag = entriesEtag(entries);
    const headers = { "Cache-Control": "public, max-age=10, s-maxage=15", "ETag": etag };
    if (context.request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers: { ...corsHeaders(context.request), ...headers } });
    }
    return json(context.request, { version: VERSION, entries, fetchedAt: Date.now() }, 200, headers);
  } catch (error) {
    console.error("Canopy leaderboard read failed", error);
    return apiError(context.request, 503, "leaderboard_unavailable", "The community leaderboard is temporarily unavailable.");
  }
}

export async function onRequestPost(context) {
  const origin = context.request.headers.get("Origin") || "";
  if (!isOriginAllowed(origin)) return apiError(context.request, 403, "origin_not_allowed", "This website cannot submit runs.");
  if (!context.env.CANOPY_DB) {
    return apiError(context.request, 503, "leaderboard_unavailable", "The community leaderboard is being set up. Your run is still saved locally.");
  }
  if (!(await checkRateLimit(context))) {
    return apiError(context.request, 429, "rate_limited", "Too many submissions. Try again in one minute.", { "Retry-After": "60" });
  }
  const contentType = context.request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return apiError(context.request, 415, "json_required", "Leaderboard submissions must use JSON.");
  }
  const declaredLength = Number(context.request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return apiError(context.request, 413, "body_too_large", "The submission is too large.");
  let raw;
  try {
    const text = await context.request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return apiError(context.request, 413, "body_too_large", "The submission is too large.");
    }
    raw = JSON.parse(text);
  } catch {
    return apiError(context.request, 400, "invalid_json", "The submission is not valid JSON.");
  }
  const validation = validateSubmission(raw);
  if (!validation.ok) return apiError(context.request, 400, validation.code, validation.message);
  const run = validation.value;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  try {
    const insert = await context.env.CANOPY_DB.prepare(`
      INSERT INTO canopy_caliber_runs
        (id, board_version, client_run_id, player_name, time_ms, score, health, skin_id, weapon_id, created_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_run_id) DO NOTHING
    `).bind(id, VERSION, run.clientRunId, run.playerName, run.timeMs, run.score, run.health, run.skinId, run.weaponId, createdAt).run();
    const duplicate = !(Number(insert?.meta?.changes) > 0);
    const row = await context.env.CANOPY_DB.prepare(`
      SELECT id, client_run_id, player_name, time_ms, score, health, skin_id, weapon_id,
             created_at_ms
      FROM canopy_caliber_runs
      WHERE board_version = ? AND client_run_id = ?
    `).bind(VERSION, run.clientRunId).first();
    if (!row) throw new Error("Inserted leaderboard row could not be loaded");
    const sameRun = row.player_name === run.playerName && row.time_ms === run.timeMs && row.score === run.score && row.health === run.health && row.skin_id === run.skinId && row.weapon_id === run.weaponId;
    if (!sameRun) return apiError(context.request, 409, "run_id_conflict", "That run ID was already used for a different result.");
    const rank = await entryRank(context.env.CANOPY_DB, row);
    const entries = await topEntries(context.env.CANOPY_DB);
    return json(context.request, {
      version: VERSION,
      accepted: true,
      duplicate,
      entry: publicEntry(row, rank),
      rank,
      madeTopTen: rank <= MAX_ENTRIES,
      entries,
    }, duplicate ? 200 : 201, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("Canopy leaderboard submission failed", error);
    return apiError(context.request, 503, "leaderboard_unavailable", "The run is saved locally and can be retried later.");
  }
}
