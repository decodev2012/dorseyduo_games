import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const home = await readFile(new URL("index.html", root), "utf8");
const game = await readFile(new URL("time-loop-heist/index.html", root), "utf8");
const robots = await readFile(new URL("robots.txt", root), "utf8");
const sitemap = await readFile(new URL("sitemap.xml", root), "utf8");

test("Chrono Vault has indexable titles, descriptions, and canonical URLs", () => {
  assert.match(home, /<title>Dorsey Duo Games \| Chrono Vault, Echo Heist &amp; Browser Games<\/title>/);
  assert.match(game, /<title>Chrono Vault: Echo Heist \| Dorsey Duo Games<\/title>/);
  for (const document of [home, game]) {
    assert.match(document, /<meta name="description" content="[^"]*Chrono Vault[^"]*">/);
    assert.match(document, /<meta name="robots" content="index, follow">/);
    assert.match(document, /<link rel="canonical" href="https:\/\/decodev2012\.github\.io\/dorseyduo_games\/[^"]*">/);
  }
});

test("the game publishes valid VideoGame structured data", () => {
  const block = game.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, "structured data block should exist");
  const data = JSON.parse(block[1]);
  assert.equal(data["@type"], "VideoGame");
  assert.equal(data.name, "Chrono Vault: Echo Heist");
  assert.deepEqual(data.alternateName, ["Chrono Vault", "Echo Heist"]);
  assert.equal(data.url, "https://decodev2012.github.io/dorseyduo_games/time-loop-heist/");
});

test("robots.txt exposes a root sitemap containing the game", () => {
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/decodev2012\.github\.io\/dorseyduo_games\/sitemap\.xml$/m);
  assert.match(sitemap, /<loc>https:\/\/decodev2012\.github\.io\/dorseyduo_games\/time-loop-heist\/<\/loc>/);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 25);
});
