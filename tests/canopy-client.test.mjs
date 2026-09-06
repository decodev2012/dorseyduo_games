import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const pageSource = await readFile(new URL("../monkey-grapple/index.html", import.meta.url), "utf8");
const scriptMatch = pageSource.match(/<script>([\s\S]*?)<\/script>/);

function extractFunction(name) {
  const source = scriptMatch[1];
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);

  let parenDepth = 0;
  let bodyStart = -1;
  let quote = null;
  let escaped = false;
  for (let i = source.indexOf("(", start); i < source.length; i += 1) {
    const char = source[i];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
    else if (char === "{" && parenDepth === 0) { bodyStart = i; break; }
  }
  assert.notEqual(bodyStart, -1, `${name} should have a body`);

  let braceDepth = 0;
  quote = null;
  escaped = false;
  for (let i = bodyStart; i < source.length; i += 1) {
    const char = source[i];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") braceDepth += 1;
    else if (char === "}") {
      braceDepth -= 1;
      if (braceDepth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`${name} should have a closing brace`);
}

function combatSandbox(overrides = {}) {
  const sandbox = {
    player: {
      x: 500, y: 500, vx: 50, vy: 20, w: 30, h: 66,
      hp: 12, maxHp: 100, invuln: 0, checkpoint: 1,
      ground: true, plat: { id: "old-platform" }, airJumps: 0,
      coyote: .2, jumpBuffer: .2, jumpHeld: true,
      reload: .3, shoot: 0, gunKick: 1
    },
    checkpoints: [
      { x: 170, y: 730, spawnX: 170, spawnY: 700 },
      { x: 2490, y: 730, spawnX: 2700, spawnY: 790 },
      { x: 4550, y: 820, spawnX: 4550, spawnY: 800 }
    ],
    bullets: [{ friendly: false, life: 2 }, { friendly: true, life: 2 }],
    grapple: { active: true }, slowScale: .5,
    camera: { x: 0, y: 0, leadX: 10, leadY: 5 },
    W: 1000, H: 700, WORLD_W: 7200,
    flash: 0, shake: 0, combo: 3, score: 900, kills: 4, runTime: 27,
    finishCalls: 0, outcome: null,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    burst() {}, sfx() {}, floatText() {}, toast() {},
    finish() { sandbox.finishCalls += 1; },
    ...overrides
  };
  return sandbox;
}

const respawnSource = extractFunction("respawnAtCheckpoint");
const damageSource = extractFunction("damagePlayer");

test("Canopy Caliber client script parses", () => {
  assert.ok(scriptMatch, "inline game script should exist");
  assert.doesNotThrow(() => new vm.Script(scriptMatch[1]));
});

test("global leaderboard opens first and uses the deployed API", () => {
  assert.match(pageSource, /leaderboardView="global"/);
  assert.match(pageSource, /const GLOBAL_LEADERBOARD_URL="https:\/\/dorseyduo-games-api\.pages\.dev\/api\/v1\/canopy-caliber\/leaderboard"/);
  assert.doesNotMatch(pageSource, /const GLOBAL_LEADERBOARD_URL="https:\/\/dorseyduo-games\.pages\.dev/);
});

test("global submissions stay inside the server's accepted ranges", () => {
  assert.match(pageSource, /timeMs:clamp\(timeMs,10000,86400000\)/);
  assert.match(pageSource, /score:clamp\(Math\.floor\(Number\(raw\.score\)\|\|0\),0,100000\)/);
});

test("a lethal enemy shot respawns at the latest safe checkpoint", () => {
  const sandbox = combatSandbox();
  vm.createContext(sandbox);
  vm.runInContext(`${respawnSource}\n${damageSource}\noutcome=damagePlayer(12,80,20,true);`, sandbox);

  assert.equal(sandbox.outcome, "respawned");
  assert.equal(sandbox.finishCalls, 0);
  assert.equal(sandbox.player.checkpoint, 1);
  assert.equal(sandbox.player.x, 2700);
  assert.equal(sandbox.player.y, 790);
  assert.equal(sandbox.player.hp, 100);
  assert.equal(sandbox.player.vx, 0);
  assert.equal(sandbox.player.vy, 0);
  assert.equal(sandbox.player.ground, false);
  assert.equal(sandbox.player.plat, null);
  assert.equal(sandbox.player.airJumps, 1);
  assert.ok(sandbox.player.invuln >= 1.6);
  assert.equal(sandbox.grapple, null);
  assert.equal(sandbox.bullets[0].life, 0, "hostile bullets should be cleared");
  assert.equal(sandbox.bullets[1].life, 2, "player bullets should remain");
  assert.equal(sandbox.score, 900);
  assert.equal(sandbox.kills, 4);
  assert.equal(sandbox.runTime, 27);
});

test("a lethal non-projectile hit still ends the run", () => {
  const sandbox = combatSandbox();
  vm.createContext(sandbox);
  vm.runInContext(`${respawnSource}\n${damageSource}\noutcome=damagePlayer(12,0,0,false);`, sandbox);

  assert.equal(sandbox.outcome, "defeated");
  assert.equal(sandbox.finishCalls, 1);
  assert.equal(sandbox.player.x, 500);
  assert.equal(sandbox.player.y, 500);
});

test("enemy projectiles opt into checkpoint respawning", () => {
  assert.match(pageSource, /damagePlayer\(b\.damage,b\.vx\*\.12,b\.vy\*\.08,true\)/);
});
