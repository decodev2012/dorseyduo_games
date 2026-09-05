import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const pageSource = await readFile(new URL("../monkey-grapple/index.html", import.meta.url), "utf8");
const scriptMatch = pageSource.match(/<script>([\s\S]*?)<\/script>/);

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
