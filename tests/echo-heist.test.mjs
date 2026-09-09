import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../time-loop-heist/index.html", import.meta.url), "utf8");
const source = await readFile(new URL("../time-loop-heist/game.js", import.meta.url), "utf8");

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

function createRuntime() {
  const elements = new Map();
  const document = {
    body: makeElement("body"),
    getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); },
    addEventListener() {}, hidden: false
  };
  const storage = new Map();
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

test("menu, gameplay HUD, pause, help, result, and all promised controls exist", () => {
  for (const id of ["menu", "hud", "pause", "help", "result", "playButton", "soundButton", "objectiveText", "alertFill"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const control of ["WASD", "SPACE", "E", "R"]) assert.match(html, new RegExp(`>${control}<`));
  assert.match(html, /<script src="game\.js"><\/script>/);
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

test("guard patrol routes keep moving around solid scenery", () => {
  const { debug } = createRuntime();
  debug.resetMission(); debug.setState("playing");
  const starts = debug.game.guards.map((guard) => ({ x: guard.x, y: guard.y }));
  for (let i = 0; i < 1200; i += 1) debug.updateGuards(1 / 120);
  debug.game.guards.forEach((guard, index) => assert.ok(Math.hypot(guard.x - starts[index].x, guard.y - starts[index].y) > 20, `guard ${index + 1} should not be stuck`));
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
