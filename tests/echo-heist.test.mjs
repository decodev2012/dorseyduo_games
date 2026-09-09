import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../time-loop-heist/index.html", import.meta.url), "utf8");
const source = await readFile(new URL("../time-loop-heist/game.js", import.meta.url), "utf8");
const homeHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");

function makeElement(id) {
  const listeners = new Map();
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === "createLinearGradient" || property === "createRadialGradient") return () => gradient;
      if (property === "measureText") return (text) => ({ width: String(text).length * 7 });
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; }
  });
  return {
    id, hidden: false, textContent: "", title: "", innerHTML: "", style: {}, offsetWidth: 320,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, focus() {},
    addEventListener(type, handler) { listeners.set(type, handler); },
    getContext: id === "game" ? () => context : undefined
  };
}

function createRuntime(initialStorage = []) {
  const elements = new Map();
  const document = {
    body: makeElement("body"),
    getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); },
    addEventListener() {}, hidden: false
  };
  const storage = new Map(initialStorage);
  const sandbox = {
    document,
    location: { hostname: "localhost", protocol: "http:" },
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    performance: { now: () => 0 },
    matchMedia: () => ({ matches: false }),
    addEventListener() {}, requestAnimationFrame: () => 1, setTimeout: () => 1,
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    Math, JSON, Object, Number, String, Array, Set, Map, console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "time-loop-heist/game.js" });
  return { debug: sandbox.__echoHeistDebug, elements, storage };
}

function overlapsCircle(rect, point, radius = 18) {
  const x = Math.max(rect.x, Math.min(rect.x + rect.w, point.x));
  const y = Math.max(rect.y, Math.min(rect.y + rect.h, point.y));
  return (point.x - x) ** 2 + (point.y - y) ** 2 < radius ** 2;
}

function pathExists(start, finish, walls, radius = 18, step = 24) {
  const cols = Math.ceil(2000 / step), rows = Math.ceil(1125 / step);
  const key = (x, y) => `${x},${y}`;
  const cell = (point) => [Math.round(point.x / step), Math.round(point.y / step)];
  const [sx, sy] = cell(start), [fx, fy] = cell(finish);
  const queue = [[sx, sy]];
  const seen = new Set([key(sx, sy)]);
  while (queue.length) {
    const [x, y] = queue.shift();
    if (Math.abs(x - fx) <= 1 && Math.abs(y - fy) <= 1) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen.has(key(nx, ny))) continue;
      const point = { x: nx * step, y: ny * step };
      if (walls.some((wall) => overlapsCircle(wall, point, radius))) continue;
      seen.add(key(nx, ny)); queue.push([nx, ny]);
    }
  }
  return false;
}

test("Echo Heist script parses and initializes without a browser crash", () => {
  assert.doesNotThrow(() => new vm.Script(source));
  const { debug } = createRuntime();
  assert.ok(debug, "localhost test controls should be available");
  assert.equal(debug.getState(), "menu");
  assert.doesNotThrow(() => debug.render(), "a complete canvas frame should render");
});

test("Echo Heist is clearly featured at the top of the games homepage", () => {
  assert.match(homeHtml, /href="time-loop-heist\/\?v=campaign-5" class="card featured" id="echo-heist"/);
  assert.ok(homeHtml.indexOf("id=\"echo-heist\"") < homeHtml.indexOf("href=\"monkey-grapple/index.html\""));
  assert.match(homeHtml, /justify-content: flex-start/);
  assert.match(homeHtml, /4 LEVELS LIVE/);
});

test("menu, gameplay HUD, pause, help, result, and all promised controls exist", () => {
  for (const id of ["menu", "hud", "pause", "help", "result", "playButton", "soundButton", "objectiveText", "alertFill", "levelSelect", "levelButton1", "levelButton2", "levelButton3", "levelButton4", "nextButton"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const control of ["WASD", "SPACE", "E", "R"]) assert.match(html, new RegExp(`>${control}<`));
  assert.match(html, /<script src="game\.js\?v=campaign-5"><\/script>/);
  assert.match(html, /id="timerValue">40\.0</);
  assert.match(html, /Maximum echoes: 4/);
});

test("every DOM binding resolves to one unique element", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "HTML ids should not be duplicated");
  const boundIds = [...source.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]);
  for (const id of boundIds) assert.ok(ids.includes(id), `#${id} should exist in the page`);
});

test("recorded terminal input becomes a working echo on the next loop", () => {
  const { debug } = createRuntime();
  const { TERMINAL } = debug.constants;
  debug.resetMission(); debug.setState("playing");
  debug.setPlayer(TERMINAL.x, TERMINAL.y); debug.setHeld("KeyE", true);
  debug.updateDevices(.15); debug.updateDevices(.15);
  assert.equal(debug.game.terminalActive, true);
  debug.game.loopTime = 2;
  debug.recordFrame(true);
  debug.beginRewind("TEST REWIND");
  assert.equal(debug.getState(), "rewinding");
  debug.completeRewind();
  assert.equal(debug.game.loop, 2);
  assert.equal(debug.game.echoes.length, 1);
  assert.equal(debug.game.echoes[0].frames.at(-1).actions & 1, 1);

  debug.setState("playing"); debug.game.loopTime = 7;
  debug.updateDevices(.15); debug.updateDevices(.15);
  assert.equal(debug.game.terminalActive, true, "Echo 01 should keep holding the terminal after its recording ends");
});

test("two sequentially recorded echoes can open both gates for the third loop", () => {
  const { debug } = createRuntime();
  const { TERMINAL, SYNC_PAD, CORE, EXIT } = debug.constants;
  debug.resetMission(); debug.setState("playing");
  debug.game.loopTime = 0; debug.recordFrame(true);
  debug.game.loopTime = 2; debug.setPlayer(TERMINAL.x, TERMINAL.y); debug.setHeld("KeyE", true); debug.recordFrame(true);
  debug.beginRewind("LOOP ONE"); debug.completeRewind();
  assert.equal(debug.game.loop, 2); assert.equal(debug.game.echoes.length, 1);

  debug.setState("playing"); debug.game.loopTime = 0; debug.recordFrame(true);
  debug.game.loopTime = 4; debug.setHeld("KeyE", false); debug.setPlayer(SYNC_PAD.x, SYNC_PAD.y); debug.recordFrame(true);
  debug.beginRewind("LOOP TWO"); debug.completeRewind();
  assert.equal(debug.game.loop, 3); assert.equal(debug.game.echoes.length, 2);

  debug.setState("playing"); debug.game.loopTime = 8;
  debug.setPlayer(CORE.x, CORE.y); debug.setHeld("KeyE", true);
  for (let i = 0; i < 4; i += 1) debug.updateDevices(.18);
  assert.equal(debug.game.terminalActive, true);
  assert.equal(debug.game.plateActive, true);
  assert.equal(debug.game.doorOpen, true);
  assert.equal(debug.game.core, true);

  debug.setPlayer(EXIT.x, EXIT.y); debug.updateDevices(.02);
  assert.equal(debug.getState(), "success");
  debug.endMission(true);
  assert.equal(debug.getState(), "result");
  assert.equal(debug.game.loop, 3);
});

test("every campaign operation can be solved with two synchronized echoes", () => {
  const { debug } = createRuntime();
  for (let index = 0; index < debug.levels.length; index += 1) {
    debug.selectLevel(index);
    const level = debug.getLevel();
    debug.resetMission(); debug.setState("playing");

    debug.game.loopTime = 2; debug.setPlayer(level.terminal.x, level.terminal.y); debug.setHeld("KeyE", true); debug.recordFrame(true);
    debug.beginRewind("TERMINAL ROUTE"); debug.completeRewind();
    debug.setState("playing"); debug.game.loopTime = 4; debug.setHeld("KeyE", false); debug.setPlayer(level.pad.x, level.pad.y); debug.recordFrame(true);
    debug.beginRewind("PAD ROUTE"); debug.completeRewind();

    debug.setState("playing"); debug.game.loopTime = 8;
    debug.setPlayer(level.spawn.x, level.spawn.y); debug.updateDevices(.2); debug.updateDevices(.2);
    assert.equal(debug.game.terminalActive, true, `${level.name}: terminal echo active`);
    assert.equal(debug.game.plateActive, true, `${level.name}: pad echo active`);
    for (const shard of debug.game.shards) { debug.setPlayer(shard.x, shard.y); debug.updateDevices(.02); }
    assert.equal(debug.game.shards.every((shard) => shard.collected), true, `${level.name}: fragments recovered`);
    debug.setPlayer(level.core.x, level.core.y); debug.setHeld("KeyE", true);
    for (let step = 0; step < 4; step += 1) debug.updateDevices(.18);
    assert.equal(debug.game.core, true, `${level.name}: Core recovered`);
    debug.setPlayer(level.exit.x, level.exit.y); debug.updateDevices(.02);
    assert.equal(debug.getState(), "success", `${level.name}: extraction reached`);
  }
});

test("dashing into an active laser can never skip the terminal echo", () => {
  const { debug } = createRuntime();
  debug.resetMission(); debug.setState("playing"); debug.game.loopTime = 1;
  debug.setPlayer(660, 744); debug.input.lastMoveX = 1; debug.input.lastMoveY = 0; debug.input.pressed.add("Space");
  debug.updatePlayer(.033); debug.updateDevices(.033);
  assert.equal(debug.getState(), "rewinding");
  assert.equal(debug.game.rewindReason, "LASER GRID CAPTURE");
});

test("rewind requires a deliberate hold instead of a destructive tap", () => {
  const { debug } = createRuntime();
  debug.resetMission(); debug.setState("playing"); debug.game.loopTime = 1; debug.setHeld("KeyR", true);
  debug.updatePlaying(.2); debug.updatePlaying(.2);
  assert.equal(debug.getState(), "playing");
  debug.updatePlaying(.08);
  assert.equal(debug.getState(), "rewinding");
});

test("all required routes have enough physical clearance", () => {
  const { debug } = createRuntime();
  const { WALLS, PROPS, VAULT_GATE, TERMINAL, SYNC_PAD, CORE, EXIT } = debug.constants;
  const solids = [...WALLS, ...PROPS];
  const spawn = { x: 170, y: 900 };
  assert.equal(pathExists(spawn, TERMINAL, [...solids, VAULT_GATE]), true, "spawn to terminal");
  assert.equal(pathExists(TERMINAL, SYNC_PAD, [...solids, VAULT_GATE]), true, "terminal to sync pad");
  assert.equal(pathExists(SYNC_PAD, CORE, solids), true, "open gate to core");
  assert.equal(pathExists(CORE, EXIT, solids), true, "core to extraction");
});

test("all four campaign levels have reachable objectives and safe spawn points", () => {
  const { debug } = createRuntime();
  assert.equal(debug.levels.length, 4);
  for (let index = 0; index < debug.levels.length; index += 1) {
    debug.selectLevel(index);
    const level = debug.getLevel();
    const solids = [...level.walls, ...level.props];
    assert.equal(solids.some((solid) => overlapsCircle(solid, level.spawn, 18)), false, `${level.name} spawn should be clear`);
    for (const [label, point, radius] of [["terminal", level.terminal, 18], ["sync pad", level.pad, 18], ["Core", level.core, 18], ["exit", level.exit, 18]]) {
      assert.equal(solids.some((solid) => overlapsCircle(solid, point, radius)), false, `${level.name} ${label} should be clear`);
    }
    for (const shard of level.shards) assert.equal(solids.some((solid) => overlapsCircle(solid, shard, 14)), false, `${level.name} fragment should be clear`);
    for (const portal of level.portals) for (const endpoint of [portal.a, portal.b]) assert.equal(solids.some((solid) => overlapsCircle(solid, endpoint, 18)), false, `${level.name} portal should be clear`);
    assert.equal(pathExists(level.spawn, level.terminal, [...solids, level.vaultGate]), true, `${level.name}: spawn to terminal`);
    assert.equal(pathExists(level.terminal, level.pad, [...solids, level.vaultGate]), true, `${level.name}: terminal to pad`);
    assert.equal(pathExists(level.pad, level.core, solids), true, `${level.name}: pad to core with vault open`);
    assert.equal(pathExists(level.core, level.exit, solids), true, `${level.name}: core to extraction`);
    for (const [guardIndex, guard] of level.guards.entries()) {
      for (const point of guard.route) assert.equal(solids.some((solid) => overlapsCircle(solid, { x: point[0], y: point[1] }, 16)), false, `${level.name}: guard ${guardIndex + 1} route point is clear`);
    }
  }
});

test("switching levels resets runtime actors to that operation", () => {
  const { debug } = createRuntime();
  for (let index = 0; index < debug.levels.length; index += 1) {
    debug.selectLevel(index); debug.resetMission();
    const level = debug.getLevel();
    assert.equal(debug.game.player.x, level.spawn.x);
    assert.equal(debug.game.player.y, level.spawn.y);
    assert.equal(debug.game.guards.length, level.guards.length);
    assert.equal(debug.game.cameras.length, level.cameras.length);
    assert.equal(debug.game.shards.length, level.shards.length);
    assert.equal(debug.game.loop, 1);
    assert.equal(debug.game.echoes.length, 0);
    assert.doesNotThrow(() => debug.render(), `${level.name} should render a complete frame`);
  }
});

test("pulse floors capture on their live beat and mirror portals preserve momentum", () => {
  const { debug } = createRuntime();
  debug.selectLevel(1); debug.resetMission(); debug.setState("playing");
  const pulse = debug.getLevel().pulseFields[0];
  debug.game.loopTime = .5; debug.setPlayer(pulse.x + pulse.w / 2, pulse.y + pulse.h / 2); debug.updateDevices(.02);
  assert.equal(debug.getState(), "rewinding");

  debug.selectLevel(2); debug.resetMission(); debug.setState("playing");
  const portal = debug.getLevel().portals[0];
  debug.setPlayer(portal.a.x, portal.a.y); debug.game.player.vx = 100; debug.game.loopTime = 1; debug.updateDevices(.02);
  assert.ok(Math.hypot(debug.game.player.x - portal.b.x, debug.game.player.y - portal.b.y) < 2);
  assert.ok(debug.game.player.vx > 100);
  debug.updateDevices(1);
  assert.ok(Math.hypot(debug.game.player.x - portal.b.x, debug.game.player.y - portal.b.y) < 2, "standing in the destination should not bounce back");
  debug.setPlayer(portal.b.x + 60, portal.b.y); debug.updateDevices(.02);
  debug.setPlayer(portal.b.x, portal.b.y); debug.updateDevices(.02);
  assert.ok(Math.hypot(debug.game.player.x - portal.a.x, debug.game.player.y - portal.a.y) < 2, "portal should rearm after leaving it");
});

test("time fragments lock the Core until every fragment is recovered", () => {
  const { debug } = createRuntime();
  debug.selectLevel(1); debug.resetMission(); debug.setState("playing");
  const level = debug.getLevel();
  debug.game.loopTime = 2; debug.setPlayer(level.core.x, level.core.y); debug.setHeld("KeyE", true);
  debug.updateDevices(.7);
  assert.equal(debug.game.core, false);
  debug.game.shards.forEach((shard) => { shard.collected = true; });
  debug.updateDevices(.7);
  assert.equal(debug.game.core, true);
});

test("all four operations are playable immediately and clearing one saves its best run", () => {
  const { debug, storage, elements } = createRuntime();
  for (let index = 0; index < debug.levels.length; index += 1) {
    assert.equal(elements.get(`levelButton${index + 1}`).disabled, false);
    assert.equal(debug.selectLevel(index), true);
  }
  debug.selectLevel(0); debug.resetMission(); debug.setState("playing");
  debug.game.loop = 3; debug.game.totalTime = 60; debug.endMission(true);
  const saved = JSON.parse(storage.get("echoHeistCampaignV2"));
  assert.equal(saved.completed["chrono-vault"], true);
  assert.equal(saved.unlocked, 4);
  assert.equal(saved.bests["chrono-vault"].rank, "S");
  assert.equal(elements.get("levelButton2").disabled, false);
});

test("an old single-level best migrates into the campaign save", () => {
  const oldBest = JSON.stringify({ time: 72, loops: 3, rank: "A" });
  const { debug, elements } = createRuntime([["echoHeistBestV1", oldBest]]);
  assert.equal(debug.getLevel().id, "chrono-vault");
  assert.equal(elements.get("levelButton2").disabled, false);
  assert.match(elements.get("bestResult").textContent, /A RANK/);
});

test("corrupt legacy data cannot erase valid campaign progress", () => {
  const campaign = JSON.stringify({ unlocked: 3, selected: 1.9, completed: { "chrono-vault": true }, bests: { "chrono-vault": { time: 68, loops: 3, rank: "S" } } });
  const { debug, elements } = createRuntime([["echoHeistCampaignV2", campaign], ["echoHeistBestV1", "{broken"]]);
  assert.equal(debug.getLevel().id, "neon-foundry", "fractional indexes should safely normalize to an integer");
  assert.equal(elements.get("levelButton3").disabled, false);
  assert.equal(elements.get("levelButton4").disabled, false);
});

test("every guard patrol keeps advancing instead of wedging into scenery", () => {
  const { debug } = createRuntime();
  for (let levelIndex = 0; levelIndex < debug.levels.length; levelIndex += 1) {
    debug.selectLevel(levelIndex); debug.resetMission(); debug.setState("playing"); debug.setPlayer(0, 0);
    const lastPoints = debug.game.guards.map((guard) => guard.point), advances = debug.game.guards.map(() => 0);
    for (let frame = 0; frame < 12000; frame += 1) {
      debug.updateGuards(1 / 120);
      debug.game.guards.forEach((guard, index) => { if (guard.point !== lastPoints[index]) { advances[index] += 1; lastPoints[index] = guard.point; } });
    }
    advances.forEach((count, guardIndex) => assert.ok(count >= 2, `${debug.getLevel().name} guard ${guardIndex + 1} should advance multiple waypoints (got ${count})`));
  }
});

test("time formatting rolls rounded seconds into the next minute", () => {
  const { debug } = createRuntime();
  assert.equal(debug.formatTime(59.96), "01:00.0");
});

test("using the fifth and final loop without escaping ends the operation", () => {
  const { debug } = createRuntime();
  debug.resetMission(); debug.setState("playing"); debug.game.loop = debug.constants.MAX_LOOPS; debug.game.loopTime = 1;
  debug.recordFrame(true); debug.beginRewind("FINAL LOOP COLLAPSE"); debug.completeRewind();
  assert.equal(debug.getState(), "result");
});
