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

function createRuntime(initialStorage = [], search = "", hash = "") {
  const elements = new Map();
  const document = {
    body: makeElement("body"),
    getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); },
    addEventListener() {}, hidden: false
  };
  const storage = new Map(initialStorage);
  const sandbox = {
    document,
    location: { hostname: "localhost", protocol: "http:", search, hash },
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

function staticEcho(index, point, { actions = 0, dash = false, color = "#66f7ff" } = {}) {
  return { index, color, frames: [{ t: 0, x: point.x, y: point.y, vx: 0, vy: 0, angle: 0, actions, dash }] };
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
  assert.match(homeHtml, /href="time-loop-heist\/#chrono-vault" class="card featured" id="echo-heist"/);
  assert.match(homeHtml, /<h2>Chrono Vault — Echo Heist<\/h2>/);
  for (const operation of ["Chrono Vault", "Neon Foundry", "Mirror Archive", "Zero Hour"]) assert.match(homeHtml, new RegExp(operation));
  assert.ok(homeHtml.indexOf("id=\"echo-heist\"") < homeHtml.indexOf("href=\"monkey-grapple/index.html\""));
  assert.match(homeHtml, /justify-content: flex-start/);
  assert.match(homeHtml, /4 LEVELS LIVE/);
});

test("menu, gameplay HUD, pause, help, result, and all promised controls exist", () => {
  for (const id of ["menu", "hud", "pause", "help", "result", "playButton", "soundButton", "objectiveText", "alertFill", "levelSelect", "levelButton1", "levelButton2", "levelButton3", "levelButton4", "nextButton"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const control of ["WASD", "SPACE", "E", "R"]) assert.match(html, new RegExp(`>${control}<`));
  assert.match(html, /<script src="game\.js\?v=campaign-9"><\/script>/);
  assert.match(html, /id="timerValue">40\.0</);
  assert.match(html, /Maximum echoes: 4/);
  assert.match(html, /New harder puzzles — echo decoys in operations 02–04/i);
  assert.match(html, /NEW • START HERE \/\/ 1 guard decoy/);
});

test("the homepage deep link opens directly on the first decoy operation", () => {
  const { debug } = createRuntime([], "?v=campaign-7&level=neon-foundry");
  assert.equal(debug.getLevel().id, "neon-foundry");
  assert.equal(debug.getLevel().requiredDistractions, 1);
});

test("the clean homepage hash opens directly on Chrono Vault", () => {
  const { debug } = createRuntime([], "", "#chrono-vault");
  assert.equal(debug.getLevel().id, "chrono-vault");
});

test("missing or invalid level links preserve the saved campaign selection", () => {
  const saved = [["echoHeistCampaignV2", JSON.stringify({ selected: 2, completed: {}, bests: {} })]];
  assert.equal(createRuntime(saved).debug.getLevel().id, "mirror-archive");
  assert.equal(createRuntime(saved, "?v=campaign-7&level=not-a-level").debug.getLevel().id, "mirror-archive");
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

test("hard operations require deliberate guard decoys before the vault opens", () => {
  const { debug } = createRuntime();
  for (let index = 0; index < debug.levels.length; index += 1) {
    debug.selectLevel(index);
    const level = debug.getLevel();
    debug.resetMission(); debug.setState("playing");
    debug.setPlayer(level.spawn.x, level.spawn.y);
    const echoes = [staticEcho(1, level.terminal, { actions: 1 }), staticEcho(2, level.pad)];
    debug.setEchoes(echoes); debug.updateDevices(.2); debug.updateDevices(.2);
    assert.equal(debug.game.terminalActive, true, `${level.name}: terminal echo active`);
    assert.equal(debug.game.plateActive, true, `${level.name}: pad echo active`);
    assert.equal(debug.game.distractedGuards.size, 0, `${level.name}: ordinary task echoes do not count as decoys`);
    assert.equal(debug.game.doorOpen, level.requiredDistractions === 0, `${level.name}: old two-echo solution cannot bypass sentries`);

    const sentries = debug.game.guards.filter((guard) => guard.required);
    assert.equal(sentries.length, level.requiredDistractions, `${level.name}: one marked sentry per required decoy`);
    sentries.forEach((sentry, sentryIndex) => {
      echoes.push(staticEcho(3 + sentryIndex, sentry.bait, { dash: true, color: sentryIndex ? "#ff4fbf" : "#66f7ff" }));
      debug.setEchoes(echoes); debug.updateGuards(.05); debug.updateDevices(.05);
      assert.equal(debug.game.distractionAssignments.get(sentry.index), 3 + sentryIndex, `${level.name}: sentry ${sentryIndex + 1} takes its assigned bait`);
      assert.equal(debug.game.doorOpen, sentryIndex + 1 >= level.requiredDistractions, `${level.name}: exact decoy threshold controls the vault`);
    });

    for (const shard of debug.game.shards) { debug.setPlayer(shard.x, shard.y); debug.updateDevices(.02); }
    assert.equal(debug.game.shards.every((shard) => shard.collected), true, `${level.name}: fragments recovered`);
    debug.setPlayer(level.core.x, level.core.y); debug.setHeld("KeyE", true);
    for (let step = 0; step < 4; step += 1) debug.updateDevices(.18);
    assert.equal(debug.game.core, true, `${level.name}: Core recovered`);
    debug.setPlayer(level.exit.x, level.exit.y); debug.updateDevices(.02);
    assert.equal(debug.getState(), "success", `${level.name}: extraction reached`);
  }
});

test("a dashing echo lures a sentry without exposing the player", () => {
  const { debug } = createRuntime();
  debug.selectLevel(1); debug.resetMission(); debug.setState("playing");
  const level = debug.getLevel();
  const sentry = debug.game.guards.find((guard) => guard.required);
  debug.setPlayer(level.spawn.x, level.spawn.y);
  debug.game.echoStates = [{ x: sentry.bait.x, y: sentry.bait.y, vx: -180, vy: 0, angle: Math.PI, actions: 0, dash: true, index: 1, color: "#66f7ff" }];
  const before = Math.hypot(sentry.x - sentry.bait.x, sentry.y - sentry.bait.y);
  debug.updateGuards(.1);
  assert.equal(sentry.mode, "echoChase");
  assert.equal(debug.game.distractionAssignments.get(sentry.index), 1);
  assert.ok(Math.hypot(sentry.x - sentry.bait.x, sentry.y - sentry.bait.y) < before, "sentry should move toward the echo");
  assert.equal(debug.game.detection, 0);
  assert.equal(debug.getState(), "playing");
});

test("a visible player always takes priority over an echo decoy", () => {
  const { debug } = createRuntime();
  debug.selectLevel(1); debug.resetMission(); debug.setState("playing");
  const sentry = debug.game.guards.find((guard) => guard.required);
  debug.setPlayer(sentry.bait.x, sentry.bait.y);
  debug.game.echoStates = [{ x: sentry.bait.x, y: sentry.bait.y, dash: true, index: 1, color: "#66f7ff" }];
  debug.updateGuards(.05);
  assert.equal(sentry.mode, "chase");
  assert.equal(debug.game.distractionAssignments.size, 0);
  assert.ok(debug.game.detection > 0);
});

test("walls block echo bait and touching an echo never captures it", () => {
  const { debug } = createRuntime();
  debug.selectLevel(1); debug.resetMission(); debug.setState("playing");
  const level = debug.getLevel();
  const sentry = debug.game.guards.find((guard) => guard.required);
  debug.setPlayer(level.spawn.x, level.spawn.y);
  sentry.angle = 0;
  const blockedEcho = { x: 1500, y: 716, dash: true, index: 1, color: "#66f7ff" };
  assert.equal(debug.lineBlocked(sentry.x, sentry.y, blockedEcho.x, blockedEcho.y), true);
  assert.equal(debug.guardCanNoticeEcho(sentry, blockedEcho), false);
  debug.game.echoStates = [blockedEcho]; debug.updateGuards(.05);
  assert.notEqual(sentry.mode, "echoChase");

  sentry.angle = sentry.baseAngle; sentry.x = sentry.bait.x; sentry.y = sentry.bait.y;
  debug.game.echoStates = [{ x: sentry.x, y: sentry.y, dash: true, index: 2, color: "#66f7ff" }];
  debug.updateGuards(.02);
  assert.equal(debug.getState(), "playing", "guards do not capture intangible echoes");
  assert.equal(sentry.mode, "scan");
});

test("one echo cannot satisfy two sentries and a frozen echo is burned", () => {
  const { debug } = createRuntime();
  debug.selectLevel(2); debug.resetMission(); debug.setState("playing");
  const level = debug.getLevel();
  const sentries = debug.game.guards.filter((guard) => guard.required);
  debug.setPlayer(level.spawn.x, level.spawn.y);

  debug.game.echoStates = [{ x: sentries[0].bait.x, y: sentries[0].bait.y, dash: true, index: 1, color: "#66f7ff" }];
  debug.updateGuards(.05);
  assert.equal(debug.game.distractionAssignments.size, 1);

  sentries[1].mode = "patrol"; sentries[1].angle = sentries[1].baseAngle;
  debug.game.echoStates = [{ x: sentries[1].bait.x, y: sentries[1].bait.y, dash: true, index: 1, color: "#66f7ff" }];
  debug.updateGuards(.05);
  assert.equal(debug.game.distractionAssignments.size, 1, "one echo ID only earns one sentry credit");

  sentries[1].mode = "patrol"; sentries[1].targetEchoIndex = null; sentries[1].burnedEchoes.add(1); sentries[1].angle = sentries[1].baseAngle;
  debug.game.echoStates = [{ x: sentries[1].bait.x, y: sentries[1].bait.y, dash: true, index: 2, color: "#ff4fbf" }];
  debug.updateGuards(.05);
  assert.equal(debug.game.distractionAssignments.size, 2, "a different echo can fool the second sentry");

  const first = sentries[0];
  debug.game.echoStates = [{ x: first.bait.x, y: first.bait.y, dash: true, index: 1, color: "#66f7ff" }];
  for (let frame = 0; frame < 1400; frame += 1) debug.updateGuards(.01);
  assert.equal(first.burnedEchoes.has(1), true);
  assert.notEqual(first.mode, "echoChase", "a frozen echo cannot pin a guard forever");
  assert.ok(Math.hypot(first.x - first.homeX, first.y - first.homeY) < 18, "sentry returns to its post");
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
    const requiredSentries = level.guards.filter((guard) => guard.required);
    assert.equal(requiredSentries.length, level.requiredDistractions, `${level.name}: decoy requirement matches its sentries`);
    for (const [sentryIndex, sentry] of requiredSentries.entries()) {
      assert.equal(solids.some((solid) => overlapsCircle(solid, sentry.bait, 18)), false, `${level.name}: decoy zone ${sentryIndex + 1} is clear`);
      assert.equal(pathExists(level.spawn, sentry.bait, [...solids, level.vaultGate]), true, `${level.name}: decoy zone ${sentryIndex + 1} is reachable before the vault`);
      assert.ok(Math.hypot(level.terminal.x - sentry.bait.x, level.terminal.y - sentry.bait.y) > sentry.bait.r + 30, `${level.name}: terminal does not auto-trigger decoy ${sentryIndex + 1}`);
      assert.ok(Math.hypot(level.pad.x - sentry.bait.x, level.pad.y - sentry.bait.y) > sentry.bait.r + 30, `${level.name}: sync pad does not auto-trigger decoy ${sentryIndex + 1}`);
    }
    assert.equal(pathExists(level.spawn, level.terminal, [...solids, level.vaultGate]), true, `${level.name}: spawn to terminal`);
    assert.equal(pathExists(level.terminal, level.pad, [...solids, level.vaultGate]), true, `${level.name}: terminal to pad`);
    assert.equal(pathExists(level.pad, level.core, [...solids, level.vaultGate]), false, `${level.name}: closed vault gate blocks the Core`);
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
  const sentry = debug.game.guards.find((guard) => guard.required);
  debug.game.distractionAssignments.set(sentry.index, 1); debug.game.distractedGuards.add(sentry.index);
  debug.setEchoes([staticEcho(1, level.pad)]);
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
    advances.forEach((count, guardIndex) => {
      const guard = debug.game.guards[guardIndex];
      if (guard.sentry) assert.equal(count, 0, `${debug.getLevel().name} sentry ${guardIndex + 1} should hold its post`);
      else assert.ok(count >= 2, `${debug.getLevel().name} guard ${guardIndex + 1} should advance multiple waypoints (got ${count})`);
    });
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
