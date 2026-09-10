(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) {
    document.body.innerHTML = '<main style="min-height:100%;display:grid;place-items:center;padding:32px;background:#050811;color:#eafaff;text-align:center;font-family:system-ui"><div><h1 style="font-size:42px">Canvas unavailable</h1><p>Please reload the page or try another browser.</p><a href="../index.html" style="color:#66f7ff">Back to games</a></div></main>';
    return;
  }

  const $ = (id) => document.getElementById(id);
  const ui = {
    hud: $("hud"), menu: $("menu"), help: $("help"), signalTutorial: $("signalTutorial"), pause: $("pause"), result: $("result"),
    loop: $("loopValue"), echoes: $("echoValue"), timer: $("timerValue"), timerChip: $("timerChip"),
    objective: $("objectiveText"), objectiveFill: $("objectiveFill"), alert: $("alertFill"),
    alertState: $("alertState"), alertCard: $("alertCard"), toast: $("toast"),
    countdown: $("countdown"), rewindWash: $("rewindWash"), sound: $("soundButton"),
    best: $("bestResult"), campaign: $("campaignProgress"), chapter: $("menuChapter"), tagline: $("menuTagline"),
    briefingName: $("briefingName"), briefingClass: $("briefingClass"), briefingWindow: $("briefingWindow"), briefingEchoes: $("briefingEchoes"),
    briefingStep1Title: $("briefingStep1Title"), briefingStep1Copy: $("briefingStep1Copy"), briefingStep2Title: $("briefingStep2Title"), briefingStep2Copy: $("briefingStep2Copy"), briefingStep3Title: $("briefingStep3Title"), briefingStep3Copy: $("briefingStep3Copy"),
    levelName: $("levelName"), levelSelect: $("levelSelect"), next: $("nextButton"),
    levelButtons: [$("levelButton1"), $("levelButton2"), $("levelButton3"), $("levelButton4")],
    resultTitle: $("resultTitle"), resultSubtitle: $("resultSubtitle"),
    resultIcon: $("resultIcon"), resultRank: $("resultRank"), resultLoops: $("resultLoops"),
    resultTime: $("resultTime"), echoSlots: [$("echoSlot1"), $("echoSlot2"), $("echoSlot3"), $("echoSlot4")]
  };
  const missingUi = Object.entries(ui).flatMap(([name, value]) => Array.isArray(value) ? value.map((node, index) => node ? null : `${name}[${index}]`) : value ? [] : [name]).filter(Boolean);
  if (missingUi.length) {
    document.body.innerHTML = `<main style="min-height:100%;display:grid;place-items:center;padding:32px;background:#050811;color:#eafaff;text-align:center;font-family:system-ui"><div><h1 style="font-size:38px">Update required</h1><p>Echo Heist received a new campaign. Reload once to sync the game files.</p><button type="button" onclick="location.reload()" style="margin-top:14px;padding:12px 18px;border:0;border-radius:8px;background:#66f7ff;color:#031017;font-weight:800">Reload game</button></div></main>`;
    return;
  }

  const TAU = Math.PI * 2;
  const WORLD_W = 2000;
  const WORLD_H = 1125;
  const LOOP_DURATION = 40;
  const MAX_LOOPS = 5;
  const PLAYER_RADIUS = 17;
  const RECORD_RATE = 30;
  const SIGNAL_TUTORIAL_KEY = "echoHeistSignalTutorialV1";
  const COLORS = { cyan: "#66f7ff", pink: "#ff4fbf", amber: "#ffbd5c", red: "#ff526d", green: "#9dff8a" };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

  let viewW = innerWidth;
  let viewH = innerHeight;
  let dpr = 1;
  const camera = { x: 0, y: 0, zoom: 1, shake: 0 };

  function resize() {
    viewW = Math.max(320, innerWidth);
    viewH = Math.max(480, innerHeight);
    dpr = Math.min(devicePixelRatio || 1, 2);
    const pixelBudget = 5_000_000;
    const requested = viewW * viewH * dpr * dpr;
    if (requested > pixelBudget) dpr *= Math.sqrt(pixelBudget / requested);
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
  }
  addEventListener("resize", resize, { passive: true });
  resize();

  const outerWalls = () => [
    { x: 58, y: 76, w: 1884, h: 30 }, { x: 58, y: 1024, w: 1884, h: 30 },
    { x: 58, y: 76, w: 30, h: 978 }, { x: 1912, y: 76, w: 30, h: 978 }
  ];

  const LEVELS = [
    {
      id: "chrono-vault", operation: "01", name: "Chrono Vault", difficulty: "Initiation",
      tagline: "Chrono Vault begins Echo Heist. <strong>Record routes, rewind time, and turn your past selves into the perfect crew.</strong>",
      briefing: [["Record your route", "Every move you make is remembered by the loop."], ["Rewind time", "Your echo repeats the route while you begin again."], ["Outsmart the vault", "Hold both security links, steal the Core, and extract."]],
      resultTitle: "Core Secured", resultCopy: "The vault saw you coming. It just did not expect all your previous selves.",
      loopDuration: 40, maxLoops: 5, parTime: 85, requiredDistractions: 0, spawn: { x: 170, y: 900, angle: -Math.PI / 2 },
      floor: { x: 58, y: 76, w: 1884, h: 978 },
      rooms: [
        { x: 88, y: 106, w: 586, h: 918, color: "#0d1724", accent: "#20435c", label: "ENTRY // SECURITY" },
        { x: 718, y: 106, w: 546, h: 918, color: "#0b1820", accent: "#1b514e", label: "ARCHIVE // SYNC LAB" },
        { x: 1312, y: 106, w: 600, h: 918, color: "#191512", accent: "#594020", label: "CHRONO VAULT" }
      ],
      walls: outerWalls().concat([
        { x: 674, y: 106, w: 44, h: 540 }, { x: 674, y: 844, w: 44, h: 180 },
        { x: 1264, y: 106, w: 48, h: 404 }, { x: 1264, y: 734, w: 48, h: 290 },
        { x: 188, y: 260, w: 400, h: 34 }, { x: 176, y: 464, w: 222, h: 32 }, { x: 462, y: 464, w: 128, h: 32 },
        { x: 798, y: 218, w: 198, h: 34 }, { x: 1070, y: 218, w: 128, h: 34 }, { x: 778, y: 862, w: 184, h: 32 }, { x: 1094, y: 862, w: 104, h: 32 },
        { x: 1408, y: 706, w: 214, h: 34 }, { x: 1708, y: 706, w: 126, h: 34 }, { x: 1460, y: 214, w: 304, h: 32 }
      ]),
      props: [
        { x: 145, y: 176, w: 70, h: 42, type: "desk" }, { x: 490, y: 350, w: 82, h: 44, type: "desk" },
        { x: 790, y: 320, w: 62, h: 62, type: "server" }, { x: 890, y: 320, w: 62, h: 62, type: "server" }, { x: 1110, y: 760, w: 70, h: 52, type: "server" },
        { x: 1410, y: 810, w: 92, h: 46, type: "crate" }, { x: 1535, y: 810, w: 58, h: 46, type: "crate" }, { x: 1770, y: 540, w: 72, h: 72, type: "vault" }
      ],
      terminal: { x: 374, y: 730, r: 49 }, pad: { x: 1044, y: 625, r: 47 }, core: { x: 1660, y: 382, r: 52 }, exit: { x: 1780, y: 903, r: 62 },
      laserGates: [{ x: 684, y: 646, w: 34, h: 198 }], vaultGate: { x: 1274, y: 510, w: 38, h: 224 },
      cameras: [{ x: 1168, y: 442, angle: Math.PI * .15, range: 290, fov: .46, sweep: 1.18, speed: .62 }],
      guards: [
        { x: 255, y: 370, route: [[255, 370], [455, 330], [455, 420], [255, 420]], color: "#f07666" },
        { x: 810, y: 740, route: [[810, 740], [1060, 740], [1160, 660], [1160, 500], [850, 500], [790, 620]], color: "#f3a85f" },
        { x: 1425, y: 650, route: [[1425, 650], [1880, 650], [1880, 300], [1390, 300]], color: "#ff796f" }
      ],
      shards: [], pulseFields: [], portals: []
    },
    {
      id: "neon-foundry", operation: "02", name: "Neon Foundry", difficulty: "Volatile",
      tagline: "The Core is split across a live weapons plant. <strong>Read the security pattern, rebuild it, and escape before the next shift arrives.</strong>",
      briefing: [["Kill the grid", "Record the west terminal while furnaces pulse around you."], ["Read the floor", "Pulse zones alternate between safe and lethal."], ["Breach the freight vault", "Restore both links, recover two fragments, and crack the final security lock."]],
      resultTitle: "Foundry Robbed", resultCopy: "The assembly line kept moving. So did every version of you.",
      loopDuration: 42, maxLoops: 5, parTime: 104, requiredDistractions: 1, spawn: { x: 165, y: 890, angle: -Math.PI / 2 },
      floor: { x: 58, y: 76, w: 1884, h: 978 },
      rooms: [
        { x: 88, y: 106, w: 662, h: 918, color: "#18151b", accent: "#6a2e40", label: "INTAKE // SMELTER" },
        { x: 790, y: 106, w: 570, h: 918, color: "#151713", accent: "#6a5425", label: "LIVE ASSEMBLY" },
        { x: 1400, y: 106, w: 512, h: 918, color: "#15101b", accent: "#58316d", label: "FREIGHT VAULT" }
      ],
      walls: outerWalls().concat([
        { x: 750, y: 106, w: 40, h: 270 }, { x: 750, y: 610, w: 40, h: 414 },
        { x: 1360, y: 106, w: 40, h: 500 }, { x: 1360, y: 826, w: 40, h: 198 },
        { x: 170, y: 255, w: 410, h: 34 }, { x: 290, y: 500, w: 340, h: 34 },
        { x: 855, y: 215, w: 370, h: 32 }, { x: 820, y: 805, w: 220, h: 32 }, { x: 1110, y: 805, w: 175, h: 32 },
        { x: 1480, y: 430, w: 310, h: 34 }, { x: 1510, y: 760, w: 285, h: 34 }
      ]),
      props: [
        { x: 160, y: 365, w: 88, h: 52, type: "crate" }, { x: 620, y: 770, w: 72, h: 58, type: "server" },
        { x: 850, y: 310, w: 74, h: 74, type: "server" }, { x: 1190, y: 635, w: 78, h: 58, type: "crate" },
        { x: 1470, y: 250, w: 72, h: 72, type: "server" }, { x: 1785, y: 580, w: 72, h: 72, type: "vault" }
      ],
      terminal: { x: 430, y: 815, r: 49 }, pad: { x: 1090, y: 520, r: 47 }, core: { x: 1680, y: 275, r: 52 }, exit: { x: 1790, y: 920, r: 62 },
      laserGates: [{ x: 753, y: 376, w: 34, h: 234 }], vaultGate: { x: 1362, y: 606, w: 36, h: 220 },
      cameras: [
        { x: 690, y: 185, angle: 1.5, range: 310, fov: .43, sweep: .95, speed: .72 },
        { x: 1260, y: 340, angle: 2.4, range: 300, fov: .45, sweep: 1.1, speed: .55 },
        { x: 1830, y: 680, angle: 3.1, range: 270, fov: .42, sweep: .75, speed: .82 }
      ],
      guards: [
        { x: 245, y: 680, route: [[245, 680], [600, 680], [600, 910], [245, 910]], color: "#ff745d" },
        { x: 1288, y: 716, angle: Math.PI, route: [[1288, 716]], sentry: true, required: true, echoRange: 270, echoFov: .52, bait: { x: 1080, y: 716, r: 72 }, color: "#ffb45d" },
        { x: 1480, y: 860, route: [[1480, 860], [1880, 860], [1880, 500], [1480, 500]], color: "#ff6e8c" }
      ],
      shards: [{ x: 930, y: 690, r: 25 }, { x: 1580, y: 600, r: 25 }],
      pulseFields: [{ x: 790, y: 595, w: 570, h: 62, period: 3.2, on: 1.2, phase: .3 }, { x: 1400, y: 675, w: 512, h: 58, period: 2.8, on: 1, phase: 1.25 }], portals: []
    },
    {
      id: "mirror-archive", operation: "03", name: "Mirror Archive", difficulty: "Unstable",
      tagline: "Space folds inside the Archive. <strong>Use paired rifts, read the patrols, and assemble the fractured Core.</strong>",
      briefing: [["Anchor the link", "The first security terminal hides beyond the mirrored stacks."], ["Ride the rifts", "Blue portals preserve your speed and direction."], ["Break the prism vault", "Recover all three fragments and solve the Archive's layered security."]],
      resultTitle: "Archive Rewritten", resultCopy: "You stole the one artifact that was stored in three places at once.",
      loopDuration: 46, maxLoops: 5, parTime: 118, requiredDistractions: 2, spawn: { x: 170, y: 180, angle: .35 },
      floor: { x: 58, y: 76, w: 1884, h: 978 },
      rooms: [
        { x: 88, y: 106, w: 502, h: 918, color: "#101424", accent: "#394e8e", label: "MIRROR LOBBY" },
        { x: 630, y: 106, w: 770, h: 918, color: "#101a22", accent: "#286a78", label: "FOLDED ARCHIVE" },
        { x: 1440, y: 106, w: 472, h: 918, color: "#181126", accent: "#673e83", label: "PRISM VAULT" }
      ],
      walls: outerWalls().concat([
        { x: 590, y: 106, w: 40, h: 174 }, { x: 590, y: 500, w: 40, h: 524 },
        { x: 1400, y: 106, w: 40, h: 544 }, { x: 1400, y: 890, w: 40, h: 134 },
        { x: 180, y: 360, w: 300, h: 32 }, { x: 180, y: 665, w: 300, h: 32 },
        { x: 715, y: 290, w: 260, h: 32 }, { x: 1040, y: 290, w: 250, h: 32 },
        { x: 760, y: 600, w: 430, h: 34 }, { x: 690, y: 870, w: 260, h: 32 }, { x: 1040, y: 870, w: 270, h: 32 },
        { x: 1510, y: 470, w: 300, h: 34 }, { x: 1510, y: 760, w: 300, h: 34 }
      ]),
      props: [
        { x: 215, y: 470, w: 76, h: 58, type: "server" }, { x: 445, y: 810, w: 78, h: 54, type: "desk" },
        { x: 700, y: 720, w: 72, h: 60, type: "server" }, { x: 1210, y: 430, w: 78, h: 62, type: "server" },
        { x: 1510, y: 250, w: 64, h: 64, type: "crate" }, { x: 1800, y: 880, w: 70, h: 70, type: "vault" }
      ],
      terminal: { x: 340, y: 820, r: 49 }, pad: { x: 1130, y: 760, r: 47 }, core: { x: 1690, y: 865, r: 52 }, exit: { x: 1790, y: 185, r: 62 },
      laserGates: [{ x: 593, y: 280, w: 34, h: 220 }], vaultGate: { x: 1402, y: 650, w: 36, h: 240 },
      cameras: [
        { x: 520, y: 930, angle: -1.4, range: 300, fov: .42, sweep: .8, speed: .62 },
        { x: 985, y: 500, angle: .2, range: 330, fov: .42, sweep: 1.3, speed: .48 },
        { x: 1810, y: 620, angle: 3.1, range: 320, fov: .45, sweep: 1.05, speed: .7 }
      ],
      guards: [
        { x: 535, y: 420, angle: Math.PI, route: [[535, 420]], sentry: true, required: true, echoRange: 270, echoFov: .52, bait: { x: 350, y: 430, r: 62 }, color: "#e46f8a" },
        { x: 1320, y: 430, angle: -Math.PI / 2, route: [[1320, 430]], sentry: true, required: true, echoRange: 270, echoFov: .52, bait: { x: 1320, y: 170, r: 64 }, color: "#ed9f5c" },
        { x: 1510, y: 610, route: [[1510, 610], [1840, 610], [1840, 360], [1480, 360], [1480, 610]], color: "#fb6f78" }
      ],
      shards: [{ x: 760, y: 190, r: 25 }, { x: 1280, y: 760, r: 25 }, { x: 1640, y: 360, r: 25 }],
      pulseFields: [{ x: 1440, y: 585, w: 472, h: 64, period: 3.5, on: 1.15, phase: .9 }],
      portals: [{ a: { x: 820, y: 760 }, b: { x: 1280, y: 360 }, color: "#76d7ff" }]
    },
    {
      id: "zero-hour", operation: "04", name: "Zero Hour", difficulty: "Black Diamond",
      tagline: "The timeline is collapsing around the final Core. <strong>Every system is armed; build one flawless route through the chaos.</strong>",
      briefing: [["Read the collapse", "Map the patrols, cameras, and pulse floors before committing."], ["Build the crew", "Synchronize the two security links across separate loops."], ["Run the perfect loop", "Break the final lock, recover every fragment, and extract."]],
      resultTitle: "Timeline Owned", resultCopy: "Four impossible robberies. One flawless crew. Every member was you.",
      loopDuration: 48, maxLoops: 5, parTime: 132, requiredDistractions: 2, spawn: { x: 160, y: 900, angle: -1.1 },
      floor: { x: 58, y: 76, w: 1884, h: 978 },
      rooms: [
        { x: 88, y: 106, w: 592, h: 918, color: "#171018", accent: "#71263b", label: "COLLAPSE ZONE" },
        { x: 720, y: 106, w: 600, h: 918, color: "#17140f", accent: "#754e20", label: "KILL FLOOR" },
        { x: 1360, y: 106, w: 552, h: 918, color: "#190d13", accent: "#7b263d", label: "ZERO HOUR VAULT" }
      ],
      walls: outerWalls().concat([
        { x: 680, y: 106, w: 40, h: 94 }, { x: 680, y: 390, w: 40, h: 634 },
        { x: 1320, y: 106, w: 40, h: 394 }, { x: 1320, y: 760, w: 40, h: 264 },
        { x: 175, y: 260, w: 380, h: 34 }, { x: 220, y: 555, w: 340, h: 34 },
        { x: 800, y: 260, w: 410, h: 32 }, { x: 800, y: 515, w: 235, h: 32 }, { x: 1110, y: 515, w: 140, h: 32 }, { x: 800, y: 850, w: 410, h: 32 },
        { x: 1450, y: 300, w: 320, h: 34 }, { x: 1510, y: 650, w: 300, h: 34 }
      ]),
      props: [
        { x: 150, y: 690, w: 76, h: 56, type: "server" }, { x: 560, y: 785, w: 74, h: 60, type: "crate" },
        { x: 760, y: 670, w: 66, h: 66, type: "server" }, { x: 1190, y: 655, w: 72, h: 58, type: "server" },
        { x: 1435, y: 810, w: 78, h: 58, type: "crate" }, { x: 1785, y: 470, w: 76, h: 76, type: "vault" }
      ],
      terminal: { x: 390, y: 790, r: 49 }, pad: { x: 1050, y: 930, r: 47 }, core: { x: 1735, y: 560, r: 52 }, exit: { x: 1740, y: 915, r: 62 },
      laserGates: [{ x: 683, y: 200, w: 34, h: 190 }, { x: 990, y: 548, w: 34, h: 302 }], vaultGate: { x: 1322, y: 500, w: 36, h: 260 },
      cameras: [
        { x: 620, y: 175, angle: 2.1, range: 300, fov: .44, sweep: .95, speed: .8 },
        { x: 780, y: 420, angle: .1, range: 310, fov: .42, sweep: 1.05, speed: .7 },
        { x: 1250, y: 740, angle: 2.9, range: 320, fov: .43, sweep: 1.15, speed: .55 },
        { x: 1810, y: 780, angle: 3.3, range: 300, fov: .44, sweep: .9, speed: .75 }
      ],
      guards: [
        { x: 650, y: 300, angle: Math.PI, route: [[650, 300]], sentry: true, required: true, echoRange: 270, echoFov: .52, bait: { x: 500, y: 330, r: 62 }, color: "#ff6278" },
        { x: 1275, y: 620, angle: Math.PI, route: [[1275, 620]], sentry: true, required: true, echoRange: 270, echoFov: .52, bait: { x: 1090, y: 620, r: 68 }, color: "#ff9d54" },
        { x: 780, y: 170, route: [[780, 170], [1240, 170], [1240, 360], [780, 360]], color: "#ff625f" },
        { x: 1560, y: 900, route: [[1560, 900], [1880, 900], [1880, 580], [1835, 580], [1835, 700], [1560, 700]], color: "#f75786" }
      ],
      shards: [{ x: 850, y: 430, r: 25 }, { x: 1210, y: 940, r: 25 }, { x: 1580, y: 820, r: 25 }],
      pulseFields: [{ x: 780, y: 340, w: 220, h: 64, period: 2.7, on: 1.05, phase: .1 }, { x: 1040, y: 690, w: 185, h: 62, period: 2.4, on: .9, phase: .95 }, { x: 1480, y: 700, w: 230, h: 60, period: 2.9, on: 1.1, phase: 1.4 }],
      portals: []
    }
  ];

  let selectedLevelIndex = 0;
  let activeLevel = LEVELS[0];
  let FLOOR = activeLevel.floor;
  let TERMINAL = activeLevel.terminal;
  let SYNC_PAD = activeLevel.pad;
  let CORE = activeLevel.core;
  let EXIT = activeLevel.exit;
  let LASER_GATES = activeLevel.laserGates;
  let LASER_GATE = LASER_GATES[0];
  let VAULT_GATE = activeLevel.vaultGate;
  let ROOMS = activeLevel.rooms;
  let WALLS = activeLevel.walls;
  let PROPS = activeLevel.props;

  function applyLevel(index) {
    selectedLevelIndex = clamp(Math.trunc(Number(index) || 0), 0, LEVELS.length - 1);
    activeLevel = LEVELS[selectedLevelIndex];
    FLOOR = activeLevel.floor; TERMINAL = activeLevel.terminal; SYNC_PAD = activeLevel.pad; CORE = activeLevel.core; EXIT = activeLevel.exit;
    LASER_GATES = activeLevel.laserGates; LASER_GATE = LASER_GATES[0]; VAULT_GATE = activeLevel.vaultGate;
    ROOMS = activeLevel.rooms; WALLS = activeLevel.walls; PROPS = activeLevel.props;
  }

  const input = { held: new Set(), pressed: new Set(), lastMoveX: 1, lastMoveY: 0, touchX: 0, touchY: 0 };
  const gameKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyE", "KeyR", "Escape"]);

  addEventListener("keydown", (event) => {
    const interactive = event.target && event.target.closest && event.target.closest("button,a,input,select,textarea");
    if (interactive && event.code !== "Escape") return;
    if (gameKeys.has(event.code) && ["playing", "countdown", "rewinding", "paused"].includes(state)) event.preventDefault();
    if (!input.held.has(event.code)) input.pressed.add(event.code);
    input.held.add(event.code);
    if (event.code === "Escape") {
      if (state === "playing" || state === "countdown") pauseGame();
      else if (state === "paused") resumeGame();
    }
  });
  addEventListener("keyup", (event) => input.held.delete(event.code));
  addEventListener("blur", () => {
    input.held.clear(); input.pressed.clear(); input.touchX = 0; input.touchY = 0;
    if (state === "playing" || state === "countdown") pauseGame();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (state === "playing" || state === "countdown")) pauseGame();
  });

  const movePad = $("movePad"), moveKnob = $("moveKnob");
  let movePointer = null;
  function updateTouchMove(event) {
    const rect = movePad.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width * .5), dy = event.clientY - (rect.top + rect.height * .5);
    const radius = rect.width * .34, length = Math.hypot(dx, dy) || 1, amount = Math.min(1, length / radius);
    input.touchX = dx / length * amount; input.touchY = dy / length * amount;
    moveKnob.style.transform = `translate(calc(-50% + ${input.touchX * radius}px),calc(-50% + ${input.touchY * radius}px))`;
  }
  function releaseTouchMove(event) {
    if (movePointer !== null && event.pointerId !== movePointer) return;
    movePointer = null; input.touchX = 0; input.touchY = 0; moveKnob.style.transform = "translate(-50%,-50%)";
  }
  movePad.addEventListener("pointerdown", (event) => { event.preventDefault(); movePointer = event.pointerId; movePad.setPointerCapture(event.pointerId); updateTouchMove(event); });
  movePad.addEventListener("pointermove", (event) => { if (event.pointerId === movePointer) updateTouchMove(event); });
  movePad.addEventListener("pointerup", releaseTouchMove); movePad.addEventListener("pointercancel", releaseTouchMove);

  function bindTouchButton(id, code) {
    const button = $(id);
    const press = (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); if (!input.held.has(code)) input.pressed.add(code); input.held.add(code); button.classList.add("active"); };
    const release = (event) => { event.preventDefault(); input.held.delete(code); button.classList.remove("active"); };
    button.addEventListener("pointerdown", press); button.addEventListener("pointerup", release); button.addEventListener("pointercancel", release); button.addEventListener("lostpointercapture", release);
  }
  bindTouchButton("touchDash", "Space"); bindTouchButton("touchUse", "KeyE"); bindTouchButton("touchRewind", "KeyR");

  const audio = {
    context: null, master: null, enabled: true, musicClock: 0, musicStep: 0,
    init() {
      if (this.context) { this.resume(); return; }
      try {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return;
        this.context = new AudioCtor();
        this.master = this.context.createGain();
        this.master.gain.value = .42;
        this.master.connect(this.context.destination);
      } catch (_) { this.context = null; }
    },
    resume() { if (this.context && this.context.state === "suspended") this.context.resume().catch(() => {}); },
    tone(frequency, duration = .08, type = "sine", volume = .08, endFrequency = frequency, delay = 0) {
      if (!this.enabled || !this.context || !this.master) return;
      const now = this.context.currentTime + delay;
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(25, frequency), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, endFrequency), now + duration);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + Math.min(.018, duration * .2));
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain); gain.connect(this.master); osc.start(now); osc.stop(now + duration + .02);
    },
    noise(duration = .12, volume = .06, highpass = 500) {
      if (!this.enabled || !this.context || !this.master) return;
      const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      filter.type = "highpass"; filter.frequency.value = highpass;
      gain.gain.setValueAtTime(volume, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration);
      source.buffer = buffer; source.connect(filter); filter.connect(gain); gain.connect(this.master);
      source.start();
    },
    sfx(name) {
      this.init(); this.resume();
      if (name === "ui") { this.tone(510, .055, "sine", .045, 680); }
      if (name === "dash") { this.noise(.13, .06, 800); this.tone(150, .12, "sawtooth", .055, 75); }
      if (name === "terminal") { this.tone(420, .09, "square", .035, 680); this.tone(840, .14, "sine", .05, 1100, .05); }
      if (name === "gate") { this.tone(95, .25, "sawtooth", .045, 62); this.noise(.19, .025, 180); }
      if (name === "rewind") { this.noise(.42, .08, 700); this.tone(980, .48, "sawtooth", .06, 75); this.tone(440, .42, "sine", .055, 55, .05); }
      if (name === "alarm") { this.tone(210, .17, "square", .075, 160); this.tone(210, .17, "square", .065, 160, .22); }
      if (name === "core") { [0, .08, .16, .27].forEach((delay, i) => this.tone([330, 495, 660, 990][i], .3, "sine", .065, [420, 620, 820, 1240][i], delay)); }
      if (name === "shard") { this.tone(620, .16, "sine", .05, 980); this.tone(930, .22, "triangle", .04, 1320, .07); }
      if (name === "portal") { this.tone(190, .28, "sawtooth", .045, 740); this.tone(820, .2, "sine", .04, 260, .05); }
      if (name === "warning") { this.tone(260, .09, "square", .035, 210); this.tone(390, .08, "square", .028, 320, .12); }
      if (name === "decoy") { this.tone(760, .12, "square", .045, 430); this.tone(1040, .18, "sine", .035, 620, .08); }
      if (name === "scan") { this.noise(.16, .025, 1200); this.tone(310, .18, "triangle", .03, 170); }
      if (name === "win") { [0, .12, .25, .4].forEach((delay, i) => this.tone([262, 392, 523, 784][i], .48, "triangle", .075, [310, 466, 622, 932][i], delay)); }
      if (name === "fail") { this.tone(300, .7, "sawtooth", .055, 45); this.noise(.4, .045, 220); }
      if (name === "step") { this.tone(78 + Math.random() * 12, .035, "sine", .018, 55); }
    },
    music(dt) {
      if (!this.context || !this.enabled || state !== "playing") return;
      this.musicClock -= dt;
      if (this.musicClock > 0) return;
      this.musicClock += .42;
      const scale = [55, 65.41, 73.42, 82.41, 98, 82.41, 73.42, 65.41];
      const bass = scale[this.musicStep % scale.length];
      this.tone(bass, .34, "triangle", .025, bass * .98);
      if (this.musicStep % 2 === 0) this.tone(bass * 4, .09, "sine", .012, bass * 4.08, .08);
      if (game.detection > .4) this.tone(124, .12, "square", .015 + game.detection * .015, 118, .16);
      this.musicStep += 1;
    },
    toggle() {
      this.enabled = !this.enabled;
      if (this.enabled) { this.init(); this.resume(); this.sfx("ui"); }
      ui.sound.textContent = this.enabled ? "◖))" : "×";
      ui.sound.setAttribute("aria-pressed", String(this.enabled));
      ui.sound.title = this.enabled ? "Mute sound" : "Turn sound on";
    }
  };

  function makePlayer() {
    const spawn = activeLevel.spawn;
    return { x: spawn.x, y: spawn.y, vx: 0, vy: 0, angle: spawn.angle, radius: PLAYER_RADIUS, dash: 0, dashCooldown: 0, trailClock: 0, stepClock: 0, coreCharge: 0 };
  }

  function makeGuards() {
    return activeLevel.guards.map((guard, index) => ({
      ...guard, index, angle: guard.angle ?? 0, baseAngle: guard.angle ?? 0,
      homeX: guard.x, homeY: guard.y, route: guard.route.map((point) => point.slice()), point: guard.route.length > 1 ? 1 : 0,
      mode: "patrol", timer: 0, lastX: guard.x, lastY: guard.y, vx: 0, vy: 0,
      targetEchoIndex: null, burnedEchoes: new Set(), warnedEchoes: new Set()
    }));
  }

  function makeCameras() {
    return activeLevel.cameras.map((cameraUnit, index) => ({ ...cameraUnit, baseAngle: cameraUnit.angle, phase: cameraUnit.phase || index * 1.7 }));
  }

  function makeShards() {
    return activeLevel.shards.map((shard, index) => ({ ...shard, index, collected: false }));
  }

  function makePulseStates() {
    return activeLevel.pulseFields.map(() => ({ warned: false }));
  }

  const game = {
    loop: 1, loopTime: 0, totalTime: 0, echoes: [], echoStates: [], recording: [], recordClock: 0,
    player: makePlayer(), guards: makeGuards(), cameras: makeCameras(), shards: makeShards(), pulseStates: makePulseStates(), detection: 0, spotted: false, captures: 0,
    terminalCharge: 0, terminalActive: false, plateActive: false, doorOpen: false, doorAmount: 0,
    laserExposure: 0, core: false, coreCharge: 0, noise: null, distractedGuards: new Set(), distractionAssignments: new Map(), particles: [], rings: [],
    countdown: 0, countdownBeat: "title", rewindTime: 0, rewindReason: "", rewindHold: 0, objectiveStage: -1,
    flags: {}, elapsedSinceToast: 0, footstepSide: 0, successTime: 0, portalReady: true
  };
  let state = "menu";
  let worldTime = 0;
  let lastFrame = performance.now();
  let toastTimer = 0;
  let progress = null;

  function resetMission() {
    Object.assign(game, {
      loop: 1, loopTime: 0, totalTime: 0, echoes: [], echoStates: [], recording: [], recordClock: 0,
      player: makePlayer(), guards: makeGuards(), cameras: makeCameras(), shards: makeShards(), pulseStates: makePulseStates(), detection: 0, spotted: false, captures: 0,
      terminalCharge: 0, terminalActive: false, plateActive: false, doorOpen: false, doorAmount: 0,
      laserExposure: 0, core: false, coreCharge: 0, noise: null, distractedGuards: new Set(), distractionAssignments: new Map(), particles: [], rings: [],
      countdown: 1.35, countdownBeat: "title", rewindTime: 0, rewindReason: "", rewindHold: 0, objectiveStage: -1,
      flags: {}, elapsedSinceToast: 0, footstepSide: 0, successTime: 0, portalReady: true
    });
    camera.x = 0; camera.y = 320; camera.shake = 0;
    input.held.clear(); input.pressed.clear(); input.touchX = 0; input.touchY = 0;
    state = "countdown";
    showOnly(null);
    ui.hud.hidden = false;
    ui.hud.inert = false;
    updateObjective();
    updateHud();
    pulseCountdown("LOOP 01");
  }

  function resetLoop() {
    game.player = makePlayer();
    game.guards = makeGuards();
    game.cameras = makeCameras();
    game.shards = makeShards();
    game.pulseStates = makePulseStates();
    game.loopTime = 0; game.recording = []; game.recordClock = 0; game.echoStates = [];
    game.detection = 0; game.spotted = false; game.terminalCharge = 0; game.terminalActive = false;
    game.plateActive = false; game.doorOpen = false; game.doorAmount = 0; game.laserExposure = 0;
    game.core = false; game.coreCharge = 0; game.noise = null; game.distractedGuards = new Set(); game.distractionAssignments = new Map(); game.countdown = 1.15; game.countdownBeat = "title"; game.rewindHold = 0;
    game.flags = {}; game.objectiveStage = -1; game.portalReady = true;
    input.held.clear(); input.pressed.clear(); input.touchX = 0; input.touchY = 0;
    state = "countdown";
    pulseCountdown(`LOOP ${String(game.loop).padStart(2, "0")}`);
    updateObjective();
    updateHud();
  }

  function showOnly(element) {
    [ui.menu, ui.help, ui.signalTutorial, ui.pause, ui.result].forEach((node) => { node.hidden = node !== element; node.inert = node !== element; });
  }

  function signalTutorialSeen() {
    try { return localStorage.getItem(SIGNAL_TUTORIAL_KEY) === "1"; }
    catch (_) { return false; }
  }

  function launchMission() {
    resetMission(); canvas.focus({ preventScroll: true });
  }

  function showSignalTutorial() {
    showOnly(ui.signalTutorial);
    $("signalTutorialStart").focus({ preventScroll: true });
  }

  function confirmSignalTutorial() {
    try { localStorage.setItem(SIGNAL_TUTORIAL_KEY, "1"); }
    catch (_) { /* Private browsing may block storage; the mission can still start. */ }
    audio.sfx("ui");
    launchMission();
  }

  function startMission() {
    audio.init(); audio.resume(); audio.sfx("ui");
    if (distractionGoal() > 0 && !signalTutorialSeen()) {
      showSignalTutorial();
      return;
    }
    launchMission();
  }

  function openMenu() {
    state = "menu"; ui.hud.hidden = true; ui.hud.inert = true; showOnly(ui.menu); input.held.clear(); input.pressed.clear(); input.touchX = 0; input.touchY = 0;
    loadBest(); $("playButton").focus({ preventScroll: true });
  }

  function pauseGame() {
    if (state !== "playing" && state !== "countdown") return;
    game.resumeState = state; state = "paused"; input.held.clear(); input.pressed.clear(); input.touchX = 0; input.touchY = 0; ui.hud.inert = true; showOnly(ui.pause); $("resumeButton").focus({ preventScroll: true });
  }

  function resumeGame() {
    if (state !== "paused") return;
    state = game.resumeState === "countdown" ? "countdown" : "playing"; ui.hud.inert = false; showOnly(null); canvas.focus({ preventScroll: true });
  }

  function pulseCountdown(text) {
    ui.countdown.textContent = text;
    ui.countdown.classList.remove("show");
    void ui.countdown.offsetWidth;
    ui.countdown.classList.add("show");
  }

  function toast(text, duration = 2.3) {
    ui.toast.textContent = text; toastTimer = duration; ui.toast.classList.add("show");
  }

  function spawnParticles(x, y, color, count = 14, speed = 170) {
    if (reducedMotion) count = Math.ceil(count * .35);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const velocity = speed * (.35 + Math.random() * .75);
      const life = .3 + Math.random() * .55;
      game.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life, maxLife: life, size: 1.5 + Math.random() * 3.5, color });
    }
  }

  function spawnRing(x, y, color, max = 130, life = .55) {
    game.rings.push({ x, y, color, radius: 8, max, life, maxLife: life });
  }

  function pointInRect(x, y, rect) { return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }
  function circleRectOverlap(x, y, radius, rect) {
    const px = clamp(x, rect.x, rect.x + rect.w);
    const py = clamp(y, rect.y, rect.y + rect.h);
    return (x - px) ** 2 + (y - py) ** 2 < radius ** 2;
  }

  function colliders() {
    const list = WALLS.concat(PROPS);
    if (game.doorAmount < .78 && !game.core) list.push(VAULT_GATE);
    return list;
  }

  function moveCircle(actor, dx, dy, radius = actor.radius || 16) {
    actor.x += dx;
    for (const wall of colliders()) {
      if (!circleRectOverlap(actor.x, actor.y, radius, wall)) continue;
      if (dx > 0) actor.x = wall.x - radius;
      else if (dx < 0) actor.x = wall.x + wall.w + radius;
      actor.vx = 0;
    }
    actor.y += dy;
    for (const wall of colliders()) {
      if (!circleRectOverlap(actor.x, actor.y, radius, wall)) continue;
      if (dy > 0) actor.y = wall.y - radius;
      else if (dy < 0) actor.y = wall.y + wall.h + radius;
      actor.vy = 0;
    }
  }

  function segmentHitsRect(x1, y1, x2, y2, rect) {
    const dx = x2 - x1, dy = y2 - y1;
    let near = 0, far = 1;
    for (const [origin, delta, min, max] of [[x1, dx, rect.x, rect.x + rect.w], [y1, dy, rect.y, rect.y + rect.h]]) {
      if (Math.abs(delta) < .00001) { if (origin < min || origin > max) return false; continue; }
      let a = (min - origin) / delta, b = (max - origin) / delta;
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) return false;
    }
    return true;
  }

  function lineBlocked(x1, y1, x2, y2) {
    for (const wall of WALLS) if (segmentHitsRect(x1, y1, x2, y2, wall)) return true;
    for (const prop of PROPS) if (segmentHitsRect(x1, y1, x2, y2, prop)) return true;
    if (game.doorAmount < .78 && !game.core && segmentHitsRect(x1, y1, x2, y2, VAULT_GATE)) return true;
    return false;
  }

  function rayRectDistance(x, y, dx, dy, rect, maxDistance) {
    let near = 0, far = maxDistance;
    for (const [origin, delta, min, max] of [[x, dx, rect.x, rect.x + rect.w], [y, dy, rect.y, rect.y + rect.h]]) {
      if (Math.abs(delta) < .00001) { if (origin < min || origin > max) return Infinity; continue; }
      let a = (min - origin) / delta, b = (max - origin) / delta;
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) return Infinity;
    }
    return near >= 0 ? near : Infinity;
  }

  function rayDistance(x, y, angle, maxDistance) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let result = maxDistance;
    for (const wall of WALLS) result = Math.min(result, rayRectDistance(x, y, dx, dy, wall, maxDistance));
    for (const prop of PROPS) result = Math.min(result, rayRectDistance(x, y, dx, dy, prop, maxDistance));
    if (game.doorAmount < .78 && !game.core) result = Math.min(result, rayRectDistance(x, y, dx, dy, VAULT_GATE, maxDistance));
    return result;
  }

  function sampleEcho(echo, time) {
    const frames = echo.frames;
    if (!frames.length) return null;
    if (time <= frames[0].t) return { ...frames[0], color: echo.color, index: echo.index };
    if (time >= frames[frames.length - 1].t) return { ...frames[frames.length - 1], color: echo.color, index: echo.index };
    let low = 0, high = frames.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (frames[middle].t <= time) low = middle; else high = middle;
    }
    const a = frames[low], b = frames[high];
    const amount = clamp((time - a.t) / Math.max(.0001, b.t - a.t), 0, 1);
    return { x: lerp(a.x, b.x, amount), y: lerp(a.y, b.y, amount), vx: lerp(a.vx || 0, b.vx || 0, amount), vy: lerp(a.vy || 0, b.vy || 0, amount), angle: a.angle + angleDelta(a.angle, b.angle) * amount, actions: a.actions, dash: a.dash || b.dash, color: echo.color, index: echo.index };
  }

  function currentActions() { return input.held.has("KeyE") ? 1 : 0; }

  function recordFrame(force = false) {
    if (!force && game.recordClock < 1 / RECORD_RATE - .001) return;
    if (!force) game.recordClock = Math.max(0, game.recordClock - 1 / RECORD_RATE);
    const p = game.player;
    game.recording.push({ t: game.loopTime, x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle, actions: currentActions(), dash: p.dash > 0 });
  }

  function beginRewind(reason) {
    if (state !== "playing" || game.loopTime < .35) return;
    recordFrame(true);
    state = "rewinding"; game.rewindTime = 0; game.rewindReason = reason;
    input.held.clear(); input.pressed.clear();
    audio.sfx("rewind"); camera.shake = Math.max(camera.shake, 8);
    ui.rewindWash.classList.remove("active"); void ui.rewindWash.offsetWidth; ui.rewindWash.classList.add("active");
    toast(reason, 1.2);
  }

  function completeRewind() {
    if (game.loop >= activeLevel.maxLoops) { endMission(false); return; }
    const colors = [COLORS.cyan, COLORS.pink, COLORS.amber, COLORS.green];
    if (game.recording.length) game.echoes.push({ frames: game.recording.slice(), color: colors[game.echoes.length] || COLORS.cyan, index: game.echoes.length + 1 });
    game.loop += 1;
    resetLoop();
    setTimeout(() => { if (state === "countdown") toast(`ECHO ${String(game.echoes.length).padStart(2, "0")} SYNCHRONIZED`); }, 450);
  }

  function capture(reason) {
    if (state !== "playing") return;
    game.captures += 1; audio.sfx("alarm"); spawnParticles(game.player.x, game.player.y, COLORS.red, 25, 250); spawnRing(game.player.x, game.player.y, COLORS.red, 220, .7);
    beginRewind(reason);
  }

  function updateCountdown(dt) {
    game.countdown -= dt;
    const beat = game.countdown > .76 ? "title" : game.countdown > .26 ? "SYNC" : "GO";
    if (beat !== game.countdownBeat) { game.countdownBeat = beat; pulseCountdown(beat); }
    if (game.countdown <= 0) { state = "playing"; game.countdownBeat = ""; canvas.focus({ preventScroll: true }); }
  }

  function updatePlayer(dt) {
    const p = game.player;
    let moveX = (input.held.has("KeyD") || input.held.has("ArrowRight") ? 1 : 0) - (input.held.has("KeyA") || input.held.has("ArrowLeft") ? 1 : 0);
    let moveY = (input.held.has("KeyS") || input.held.has("ArrowDown") ? 1 : 0) - (input.held.has("KeyW") || input.held.has("ArrowUp") ? 1 : 0);
    if (Math.hypot(input.touchX, input.touchY) > .06) { moveX = input.touchX; moveY = input.touchY; }
    const length = Math.hypot(moveX, moveY);
    if (length > 0) {
      moveX /= length; moveY /= length; input.lastMoveX = moveX; input.lastMoveY = moveY;
      p.angle += angleDelta(p.angle, Math.atan2(moveY, moveX)) * Math.min(1, dt * 13);
    }

    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.dash = Math.max(0, p.dash - dt);
    if (input.pressed.has("Space") && p.dashCooldown <= 0) {
      const dx = length ? moveX : input.lastMoveX, dy = length ? moveY : input.lastMoveY;
      p.vx = dx * 570; p.vy = dy * 570; p.dash = .16; p.dashCooldown = .82; p.angle = Math.atan2(dy, dx);
      game.noise = { x: p.x, y: p.y, life: .75, radius: 300 };
      spawnParticles(p.x, p.y, COLORS.cyan, 17, 190); spawnRing(p.x, p.y, COLORS.cyan, 90, .34); camera.shake = Math.max(camera.shake, 3); audio.sfx("dash");
    }

    if (p.dash <= 0) {
      const acceleration = length ? 1450 : 0;
      p.vx += moveX * acceleration * dt; p.vy += moveY * acceleration * dt;
      const friction = Math.exp(-(length ? 8.2 : 13) * dt);
      p.vx *= friction; p.vy *= friction;
      const speed = Math.hypot(p.vx, p.vy), maxSpeed = 225;
      if (speed > maxSpeed) { p.vx *= maxSpeed / speed; p.vy *= maxSpeed / speed; }
    }
    moveCircle(p, p.vx * dt, p.vy * dt);

    const speed = Math.hypot(p.vx, p.vy);
    p.stepClock -= dt;
    if (speed > 70 && p.dash <= 0 && p.stepClock <= 0) { p.stepClock = .31; game.footstepSide ^= 1; audio.sfx("step"); }
    p.trailClock -= dt;
    if (p.dash > 0 && p.trailClock <= 0) { p.trailClock = .025; game.particles.push({ x: p.x, y: p.y, vx: -p.vx * .12, vy: -p.vy * .12, life: .28, maxLife: .28, size: 7, color: COLORS.cyan }); }
  }

  function pulseFieldActive(field) {
    return pulseFieldPhase(field) < field.on;
  }

  function pulseFieldPhase(field) {
    return (game.loopTime + field.phase) % field.period;
  }

  function pulseFieldWarning(field) {
    const phase = pulseFieldPhase(field);
    return phase >= field.on && field.period - phase <= .34;
  }

  function allShardsCollected() {
    return game.shards.every((shard) => shard.collected);
  }

  function distractionGoal() {
    return Math.max(0, Math.trunc(activeLevel.requiredDistractions || 0));
  }

  function distractionsReady() {
    return game.distractionAssignments.size >= distractionGoal();
  }

  function updatePortals() {
    const p = game.player;
    const insidePortal = activeLevel.portals.some((portal) => dist(p, portal.a) < 43 || dist(p, portal.b) < 43);
    if (!game.portalReady) {
      if (!insidePortal) game.portalReady = true;
      return;
    }
    for (const portal of activeLevel.portals) {
      let destination = null;
      if (dist(p, portal.a) < 38) destination = portal.b;
      else if (dist(p, portal.b) < 38) destination = portal.a;
      if (!destination) continue;
      spawnRing(p.x, p.y, portal.color, 105, .4);
      p.x = destination.x; p.y = destination.y; p.vx *= 1.08; p.vy *= 1.08;
      game.portalReady = false;
      spawnRing(p.x, p.y, portal.color, 125, .46);
      audio.sfx("portal"); camera.shake = Math.max(camera.shake, 3); toast("SPATIAL RIFT TRAVERSED", 1.2);
      break;
    }
  }

  function updateDevices(dt) {
    const p = game.player;
    game.echoStates = game.echoes.map((echo) => sampleEcho(echo, game.loopTime)).filter(Boolean);
    updatePortals();
    const playerUsingTerminal = dist(p, TERMINAL) < TERMINAL.r + 12 && input.held.has("KeyE");
    const echoUsingTerminal = game.echoStates.some((echo) => dist(echo, TERMINAL) < TERMINAL.r + 12 && (echo.actions & 1));
    const wasTerminal = game.terminalActive;
    if (playerUsingTerminal || echoUsingTerminal) game.terminalCharge = Math.min(1, game.terminalCharge + dt * 4.4);
    else game.terminalCharge = Math.max(0, game.terminalCharge - dt * 5.5);
    game.terminalActive = game.terminalCharge >= .45;
    if (!wasTerminal && game.terminalActive) {
      audio.sfx("terminal"); spawnRing(TERMINAL.x, TERMINAL.y, COLORS.pink, 120, .55);
      if (!game.flags.terminal) { game.flags.terminal = true; toast(game.echoes.length ? "SECURITY LINK RESTORED" : "LINKED — KEEP HOLDING E + HOLD R"); }
    }

    const wasPlate = game.plateActive;
    const wasDoorOpen = game.doorOpen;
    game.plateActive = dist(p, SYNC_PAD) < SYNC_PAD.r || game.echoStates.some((echo) => dist(echo, SYNC_PAD) < SYNC_PAD.r);
    game.doorOpen = (game.plateActive && distractionsReady()) || game.core;
    game.doorAmount += ((game.doorOpen ? 1 : 0) - game.doorAmount) * Math.min(1, dt * 8);
    if (!wasPlate && game.plateActive) {
      spawnRing(SYNC_PAD.x, SYNC_PAD.y, COLORS.amber, 135, .55);
      if (!game.flags.plate) {
        game.flags.plate = true;
        if (!distractionsReady()) toast(game.echoes.length < 2 ? "SYNC ROUTE FOUND — RECORD IT, THEN SOLVE THE SECURITY LOCK" : "SYNC HELD — VAULT SECURITY STILL ACTIVE");
        else toast(game.echoes.length < 2 ? "VAULT LINKED — STAND HERE + HOLD R" : "VAULT GATE OPEN");
      }
    }
    if (!wasDoorOpen && game.doorOpen) { audio.sfx("gate"); spawnRing(VAULT_GATE.x + VAULT_GATE.w / 2, VAULT_GATE.y + VAULT_GATE.h / 2, COLORS.green, 155, .6); }

    if (!game.terminalActive && LASER_GATES.some((gate) => circleRectOverlap(p.x, p.y, p.radius, gate))) {
      game.laserExposure = 1; camera.shake = Math.max(camera.shake, 4); capture("LASER GRID CAPTURE");
    } else game.laserExposure = Math.max(0, game.laserExposure - dt * 3);

    let pulseHit = false;
    activeLevel.pulseFields.forEach((field, index) => {
      const active = pulseFieldActive(field), warning = pulseFieldWarning(field), pulseState = game.pulseStates[index];
      if (active) pulseState.warned = false;
      else if (warning && !pulseState.warned) { pulseState.warned = true; audio.sfx("warning"); }
      if (active && circleRectOverlap(p.x, p.y, p.radius, field)) pulseHit = true;
    });
    if (pulseHit) {
      camera.shake = Math.max(camera.shake, 5); capture("PULSE FLOOR DISINTEGRATION");
    }

    const agents = [p, ...game.echoStates];
    for (const shard of game.shards) {
      if (shard.collected || !agents.some((agent) => dist(agent, shard) < shard.r + 14)) continue;
      shard.collected = true; audio.sfx("shard"); spawnParticles(shard.x, shard.y, COLORS.cyan, 24, 210); spawnRing(shard.x, shard.y, COLORS.cyan, 145, .55);
      const count = game.shards.filter((item) => item.collected).length;
      toast(game.echoes.length < 2 ? `FRAGMENT ${count} / ${game.shards.length} — YOUR ECHO CAN REPEAT THIS` : `TIME FRAGMENT ${count} / ${game.shards.length}`, 1.7);
    }

    if (!game.core && allShardsCollected() && distractionsReady() && game.doorAmount >= .78 && dist(p, CORE) < CORE.r + 8 && input.held.has("KeyE")) {
      game.coreCharge = Math.min(1, game.coreCharge + dt / .58);
      if (game.coreCharge >= 1) collectCore();
    } else game.coreCharge = Math.max(0, game.coreCharge - dt * 2.2);

    if (game.core && dist(p, EXIT) < EXIT.r) finishEscape();
  }

  function collectCore() {
    if (game.core) return;
    game.core = true; game.coreCharge = 1; game.doorOpen = true; game.doorAmount = 1;
    audio.sfx("core"); spawnParticles(CORE.x, CORE.y, COLORS.amber, 42, 280); spawnRing(CORE.x, CORE.y, COLORS.amber, 260, .9); camera.shake = Math.max(camera.shake, 8);
    toast("CHRONO CORE SECURED — REACH EXTRACTION", 3);
  }

  function guardCanSee(guard, target, range = 270, fov = .52) {
    const dx = target.x - guard.x, dy = target.y - guard.y, distance = Math.hypot(dx, dy);
    if (distance > range) return false;
    if (distance > 34 && Math.abs(angleDelta(guard.angle, Math.atan2(dy, dx))) > fov) return false;
    return !lineBlocked(guard.x, guard.y, target.x, target.y);
  }

  function cameraCanSee(cameraUnit, target) {
    const dx = target.x - cameraUnit.x, dy = target.y - cameraUnit.y, distance = Math.hypot(dx, dy);
    if (distance > cameraUnit.range) return false;
    if (Math.abs(angleDelta(cameraUnit.angle, Math.atan2(dy, dx))) > cameraUnit.fov) return false;
    return !lineBlocked(cameraUnit.x, cameraUnit.y, target.x, target.y);
  }

  function moveGuardToward(guard, tx, ty, speed, dt) {
    const dx = tx - guard.x, dy = ty - guard.y, length = Math.hypot(dx, dy);
    if (length < 4) return true;
    const angle = Math.atan2(dy, dx);
    guard.angle += angleDelta(guard.angle, angle) * Math.min(1, dt * 6.5);
    guard.vx = Math.cos(guard.angle) * speed; guard.vy = Math.sin(guard.angle) * speed;
    moveCircle(guard, guard.vx * dt, guard.vy * dt, 16);
    return length < 13;
  }

  function resumeGuardRoute(guard) {
    if (guard.sentry) { guard.mode = "return"; return; }
    let nearestPoint = 0;
    let nearestDistance = Infinity;
    guard.route.forEach((point, index) => {
      const distance = Math.hypot(guard.x - point[0], guard.y - point[1]);
      if (distance < nearestDistance) { nearestDistance = distance; nearestPoint = index; }
    });
    guard.point = nearestPoint; guard.mode = "patrol";
  }

  function guardCanNoticeEcho(guard, echo) {
    if (guard.burnedEchoes.has(echo.index)) return false;
    const distance = dist(guard, echo);
    const range = guard.echoRange || (guard.sentry ? 365 : 315);
    const visible = guardCanSee(guard, echo, range, guard.echoFov || .7);
    const heardDash = echo.dash && distance < range + 85 && !lineBlocked(guard.x, guard.y, echo.x, echo.y);
    return visible || heardDash;
  }

  function nearestEchoFor(guard) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const echo of game.echoStates) {
      if (!guardCanNoticeEcho(guard, echo)) continue;
      const distance = dist(guard, echo);
      if (distance >= nearestDistance) continue;
      nearest = echo; nearestDistance = distance;
    }
    return nearest;
  }

  function creditSentryDistraction(guard, echo) {
    const goal = distractionGoal();
    if (!guard.required || goal <= 0 || game.distractionAssignments.has(guard.index)) return false;
    const insideBait = guard.bait && dist(echo, guard.bait) <= guard.bait.r;
    if (!insideBait || !echo.dash) return false;
    const echoAlreadyUsed = [...game.distractionAssignments.values()].includes(echo.index);
    if (echoAlreadyUsed) {
      if (!guard.warnedEchoes.has(echo.index)) {
        guard.warnedEchoes.add(echo.index);
        toast("SIGNATURE ALREADY USED — UNIQUE ECHO REQUIRED", 2.4);
      }
      return false;
    }
    game.distractionAssignments.set(guard.index, echo.index);
    game.distractedGuards.add(guard.index);
    audio.sfx("decoy");
    spawnParticles(echo.x, echo.y, echo.color || COLORS.cyan, 16, 150);
    spawnRing(echo.x, echo.y, echo.color || COLORS.cyan, 130, .55);
    toast(`SIGNAL LINK ${Math.min(game.distractedGuards.size, goal)} / ${goal} — SECURITY DIVERTED`, 2.1);
    return true;
  }

  function distractGuard(guard, echo) {
    const firstPursuit = guard.mode !== "echoChase" || guard.targetEchoIndex !== echo.index;
    guard.mode = "echoChase"; guard.timer = 1.05; guard.targetEchoIndex = echo.index; guard.lastX = echo.x; guard.lastY = echo.y;
    const earnedCredit = creditSentryDistraction(guard, echo);
    if (!firstPursuit || earnedCredit) return;
    audio.sfx("decoy");
    spawnRing(echo.x, echo.y, echo.color || COLORS.cyan, 95, .4);
    if (guard.required) toast("SENTRY TRACKING TEMPORAL SIGNATURE", 2.1);
    else toast(`SECURITY ROUTE DIVERTED BY ECHO ${String(echo.index).padStart(2, "0")}`, 1.7);
  }

  function updateGuards(dt) {
    const p = game.player;
    let seen = false;
    for (const guard of game.guards) {
      const seesPlayer = guardCanSee(guard, p);
      const canAcquireEcho = guard.mode !== "chase" && guard.mode !== "echoChase" && guard.mode !== "scan";
      const visibleEcho = seesPlayer || !canAcquireEcho ? null : nearestEchoFor(guard);
      if (seesPlayer) {
        seen = true; guard.mode = "chase"; guard.timer = 2.3; guard.lastX = p.x; guard.lastY = p.y;
      } else if (visibleEcho && guard.mode !== "chase") {
        distractGuard(guard, visibleEcho);
      } else if (game.noise && Math.hypot(guard.x - game.noise.x, guard.y - game.noise.y) < game.noise.radius && guard.mode !== "chase" && guard.mode !== "echoChase") {
        guard.mode = "investigate"; guard.timer = 2.7; guard.lastX = game.noise.x; guard.lastY = game.noise.y;
      }

      if (guard.mode === "chase") {
        guard.timer -= dt;
        moveGuardToward(guard, guard.lastX, guard.lastY, 132, dt);
        if (guard.timer <= 0) resumeGuardRoute(guard);
      } else if (guard.mode === "echoChase") {
        const targetEcho = game.echoStates.find((echo) => echo.index === guard.targetEchoIndex && !guard.burnedEchoes.has(echo.index));
        if (targetEcho && guardCanNoticeEcho(guard, targetEcho)) {
          guard.lastX = targetEcho.x; guard.lastY = targetEcho.y; guard.timer = 1.05;
          creditSentryDistraction(guard, targetEcho);
        } else guard.timer -= dt;
        const caughtDecoy = targetEcho && dist(guard, targetEcho) < 31;
        const reachedLastSpot = moveGuardToward(guard, guard.lastX, guard.lastY, 122, dt);
        if (caughtDecoy || guard.timer <= 0 || reachedLastSpot) {
          if (targetEcho) guard.burnedEchoes.add(targetEcho.index);
          guard.mode = "scan"; guard.timer = 2; guard.targetEchoIndex = null; guard.vx = 0; guard.vy = 0;
          spawnRing(guard.x, guard.y, COLORS.cyan, 72, .35);
        }
      } else if (guard.mode === "scan") {
        guard.timer -= dt; guard.vx = 0; guard.vy = 0; guard.angle += dt * 2.8;
        if (guard.timer <= 0) resumeGuardRoute(guard);
      } else if (guard.mode === "return") {
        if (moveGuardToward(guard, guard.homeX, guard.homeY, 75, dt)) {
          guard.mode = "patrol"; guard.vx = 0; guard.vy = 0;
          if (guard.sentry) guard.angle += angleDelta(guard.angle, guard.baseAngle) * Math.min(1, dt * 8);
        }
      } else if (guard.mode === "investigate") {
        guard.timer -= dt;
        const arrived = moveGuardToward(guard, guard.lastX, guard.lastY, 104, dt);
        if (guard.timer <= 0 || arrived) resumeGuardRoute(guard);
      } else if (guard.sentry) {
        guard.vx = 0; guard.vy = 0;
        guard.angle += angleDelta(guard.angle, guard.baseAngle) * Math.min(1, dt * 4);
      } else {
        const target = guard.route[guard.point];
        if (moveGuardToward(guard, target[0], target[1], 70, dt)) guard.point = (guard.point + 1) % guard.route.length;
      }
      if (Math.hypot(p.x - guard.x, p.y - guard.y) < 31) { capture("INTERCEPTED BY SECURITY"); return; }
    }

    let cameraSeen = false;
    for (const cameraUnit of game.cameras) {
      cameraUnit.angle = cameraUnit.baseAngle + Math.sin(game.loopTime * cameraUnit.speed + cameraUnit.phase) * cameraUnit.sweep;
      cameraSeen = cameraSeen || cameraCanSee(cameraUnit, p);
    }
    seen = seen || cameraSeen;
    game.spotted = seen;
    if (seen) game.detection = Math.min(1, game.detection + dt * (cameraSeen ? .68 : .59));
    else game.detection = Math.max(0, game.detection - dt * .42);
    if (game.detection >= 1) capture(cameraSeen ? "CAMERA TRACE COMPLETE" : "IDENTITY TRACE COMPLETE");
  }

  function updateObjective() {
    let stage = 0, text = "Reach the magenta terminal and hold E", target = TERMINAL;
    const missingShard = game.shards.find((shard) => !shard.collected);
    if (game.core) { stage = 7; text = `Deliver the Core to ${activeLevel.name} extraction`; target = EXIT; }
    else if (game.echoes.length === 0) {
      if (game.terminalActive) { stage = 1; text = "Keep holding E and hold R to record Echo 01"; }
    } else if (!game.terminalActive) {
      stage = 2; text = "Wait for Echo 01 to restore the security link";
    } else if (game.echoes.length < 2) {
      stage = 3; text = game.plateActive ? "Stay on the amber pad and hold R" : "Reach the amber vault sync pad"; target = SYNC_PAD;
    } else if (!game.plateActive) {
      stage = 4; text = "Wait for Echo 02 to reach the sync pad"; target = SYNC_PAD;
    } else if (!distractionsReady()) {
      const sentry = game.guards.find((guard) => guard.required && !game.distractedGuards.has(guard.index));
      stage = 4; text = `Synchronize marked signals: ${game.distractedGuards.size} / ${distractionGoal()}`; target = sentry ? sentry.bait : VAULT_GATE;
    } else if (game.doorAmount < .78) {
      stage = 4; text = "Security diverted — move through the opening"; target = VAULT_GATE;
    } else if (missingShard) {
      const found = game.shards.filter((shard) => shard.collected).length;
      stage = 5; text = `Collect time fragments ${found} / ${game.shards.length}`; target = missingShard;
    } else {
      stage = 6; text = "Hold E beside the Chrono Core"; target = CORE;
    }
    game.objectiveTarget = target;
    if (stage !== game.objectiveStage) { game.objectiveStage = stage; ui.objective.textContent = text; ui.objectiveFill.style.width = `${Math.round(stage / 7 * 100)}%`; }
    else if (ui.objective.textContent !== text) ui.objective.textContent = text;
  }

  function updatePlaying(dt) {
    game.loopTime += dt; game.totalTime += dt; game.recordClock += dt; game.elapsedSinceToast += dt;
    updatePlayer(dt);
    updateDevices(dt);
    if (state !== "playing") return;
    updateGuards(dt);
    if (state !== "playing") return;
    recordFrame();
    updateObjective();
    if (game.noise) { game.noise.life -= dt; if (game.noise.life <= 0) game.noise = null; }
    if (input.held.has("KeyR")) {
      game.rewindHold = Math.min(.48, game.rewindHold + dt);
      if (game.rewindHold >= .46) beginRewind(game.loop === activeLevel.maxLoops ? "FINAL LOOP COLLAPSE" : "MANUAL REWIND");
    } else game.rewindHold = Math.max(0, game.rewindHold - dt * 4);
    if (game.loopTime >= activeLevel.loopDuration && state === "playing") beginRewind("LOOP EXPIRED");
    audio.music(dt);
  }

  function updateEffects(dt) {
    for (let i = game.particles.length - 1; i >= 0; i--) {
      const particle = game.particles[i]; particle.life -= dt;
      if (particle.life <= 0) { game.particles.splice(i, 1); continue; }
      particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vx *= Math.exp(-3.2 * dt); particle.vy *= Math.exp(-3.2 * dt);
    }
    for (let i = game.rings.length - 1; i >= 0; i--) {
      const ring = game.rings[i]; ring.life -= dt;
      if (ring.life <= 0) { game.rings.splice(i, 1); continue; }
      ring.radius = lerp(ring.radius, ring.max, dt * 7);
    }
    camera.shake = Math.max(0, camera.shake - dt * 22);
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove("show"); }
  }

  function updateCamera(dt) {
    const target = game.player || { x: 1000, y: 560 };
    const desiredZoom = clamp(Math.min(viewW / 1280, viewH / 760), .72, 1.08);
    camera.zoom += (desiredZoom - camera.zoom) * Math.min(1, dt * 4);
    const visibleW = viewW / camera.zoom, visibleH = viewH / camera.zoom;
    let tx = target.x - visibleW * .5, ty = target.y - visibleH * .5;
    if (state === "menu") { tx = 385 + Math.sin(worldTime * .12) * 170; ty = 150 + Math.cos(worldTime * .1) * 70; }
    const maxX = WORLD_W - visibleW, maxY = WORLD_H - visibleH;
    tx = maxX < 0 ? maxX * .5 : clamp(tx, 0, maxX);
    ty = maxY < 0 ? maxY * .5 : clamp(ty, 0, maxY);
    camera.x += (tx - camera.x) * Math.min(1, dt * (state === "menu" ? .7 : 5.5));
    camera.y += (ty - camera.y) * Math.min(1, dt * (state === "menu" ? .7 : 5.5));
  }

  function finishEscape() {
    if (state !== "playing") return;
    audio.sfx("win"); spawnParticles(EXIT.x, EXIT.y, COLORS.green, 60, 330); spawnRing(EXIT.x, EXIT.y, COLORS.green, 330, 1);
    state = "success"; game.successTime = 0; input.held.clear(); input.pressed.clear(); input.touchX = 0; input.touchY = 0; toast("EXTRACTION COMPLETE", 1.2); camera.shake = Math.max(camera.shake, 7);
  }

  function missionRank() {
    if (game.loop <= 3 && game.captures === 0 && game.totalTime < activeLevel.parTime) return "S";
    if (game.loop <= 3 && game.captures <= 1) return "A";
    if (game.loop <= 4) return "B";
    return "C";
  }

  function endMission(success) {
    state = "result"; input.held.clear(); input.pressed.clear(); ui.hud.hidden = true; ui.hud.inert = true; showOnly(ui.result);
    if (success) {
      const rank = missionRank();
      ui.resultIcon.textContent = "◇"; ui.resultTitle.textContent = activeLevel.resultTitle;
      ui.resultSubtitle.textContent = activeLevel.resultCopy;
      ui.resultRank.textContent = rank; ui.resultLoops.textContent = String(game.loop).padStart(2, "0"); ui.resultTime.textContent = formatTime(game.totalTime);
      saveBest({ time: game.totalTime, loops: game.loop, rank });
      ui.next.hidden = selectedLevelIndex >= LEVELS.length - 1;
    } else {
      audio.sfx("fail"); ui.resultIcon.textContent = "⌁"; ui.resultTitle.textContent = `${activeLevel.name} Lost`;
      ui.resultSubtitle.textContent = "The loop collapsed, but security remembers nothing. Try a cleaner route.";
      ui.resultRank.textContent = "—"; ui.resultLoops.textContent = String(game.loop).padStart(2, "0"); ui.resultTime.textContent = formatTime(game.totalTime);
      ui.next.hidden = true;
    }
    $("replayButton").focus({ preventScroll: true });
  }

  function formatTime(seconds) {
    const tenths = Math.max(0, Math.round(seconds * 10));
    const minutes = Math.floor(tenths / 600), rest = (tenths - minutes * 600) / 10;
    return `${String(minutes).padStart(2, "0")}:${rest.toFixed(1).padStart(4, "0")}`;
  }

  function readProgress() {
    const fallback = { unlocked: LEVELS.length, selected: 0, completed: {}, bests: {} };
    let result = fallback;
    try {
      const stored = JSON.parse(localStorage.getItem("echoHeistCampaignV2") || "null");
      result = stored && typeof stored === "object" ? {
        unlocked: LEVELS.length,
        selected: clamp(Math.trunc(Number(stored.selected) || 0), 0, LEVELS.length - 1),
        completed: stored.completed && typeof stored.completed === "object" ? stored.completed : {},
        bests: stored.bests && typeof stored.bests === "object" ? stored.bests : {}
      } : fallback;
    } catch (_) { result = fallback; }
    try {
      const oldBest = JSON.parse(localStorage.getItem("echoHeistBestV1") || "null");
      if (oldBest && Number.isFinite(oldBest.time) && !result.bests[LEVELS[0].id]) {
        result.bests[LEVELS[0].id] = oldBest; result.completed[LEVELS[0].id] = true; result.unlocked = Math.max(result.unlocked, 2);
      }
    } catch (_) {}
    result.unlocked = LEVELS.length;
    result.selected = clamp(result.selected, 0, LEVELS.length - 1);
    return result;
  }

  function writeProgress() {
    try { localStorage.setItem("echoHeistCampaignV2", JSON.stringify(progress)); } catch (_) {}
  }

  function requestedLevelIndex() {
    const search = typeof location.search === "string" ? location.search : "";
    const match = search.match(/[?&]level=([^&]+)/i);
    const hash = typeof location.hash === "string" ? location.hash.replace(/^#/, "") : "";
    const requested = (match ? match[1] : hash).toLowerCase();
    if (!requested) return -1;
    return LEVELS.findIndex((level) => level.id === requested);
  }

  function refreshMenu() {
    const level = activeLevel;
    const completed = LEVELS.filter((item) => progress.completed[item.id]).length;
    ui.chapter.textContent = `${level.name} // Echo Heist // Operation ${level.operation}`;
    ui.tagline.innerHTML = level.tagline;
    ui.briefingName.textContent = `${level.name} briefing`;
    ui.briefingClass.textContent = level.difficulty;
    [[ui.briefingStep1Title, ui.briefingStep1Copy], [ui.briefingStep2Title, ui.briefingStep2Copy], [ui.briefingStep3Title, ui.briefingStep3Copy]].forEach((nodes, index) => { nodes[0].textContent = level.briefing[index][0]; nodes[1].textContent = level.briefing[index][1]; });
    ui.briefingWindow.textContent = `Window: ${level.loopDuration} seconds`;
    ui.briefingEchoes.textContent = `Maximum echoes: ${level.maxLoops - 1}`;
    ui.campaign.textContent = `${completed} / ${LEVELS.length} operations cleared`;
    ui.levelName.textContent = `OP ${level.operation} // ${level.name.toUpperCase()}`;
    const best = progress.bests[level.id];
    ui.best.textContent = best && Number.isFinite(best.time) ? `${best.rank} RANK // ${formatTime(best.time)} // ${best.loops} LOOPS` : "No successful breach";
    ui.levelButtons.forEach((button, index) => {
      button.disabled = false; button.classList.remove("locked"); button.classList.toggle("selected", index === selectedLevelIndex); button.classList.toggle("complete", Boolean(progress.completed[LEVELS[index].id]));
      button.setAttribute("aria-pressed", String(index === selectedLevelIndex));
      button.setAttribute("aria-label", `${LEVELS[index].name}${progress.completed[LEVELS[index].id] ? ", completed" : ""}`);
    });
  }

  function loadBest() {
    if (!progress) progress = readProgress();
    refreshMenu();
  }

  function selectLevel(index, force = false) {
    if (!progress) progress = readProgress();
    const nextIndex = clamp(Math.trunc(Number(index) || 0), 0, LEVELS.length - 1);
    applyLevel(nextIndex); progress.selected = selectedLevelIndex; writeProgress();
    game.player = makePlayer(); game.guards = makeGuards(); game.cameras = makeCameras(); game.shards = makeShards(); game.pulseStates = makePulseStates(); game.portalReady = true;
    game.echoes = []; game.echoStates = []; game.terminalActive = false; game.plateActive = false; game.doorOpen = false; game.doorAmount = 0; game.core = false; game.objectiveStage = -1;
    camera.x = 0; camera.y = 250; refreshMenu(); updateObjective();
    return true;
  }

  function saveBest(result) {
    const old = progress.bests[activeLevel.id];
    if (!old || !Number.isFinite(old.time) || result.time < old.time) progress.bests[activeLevel.id] = result;
    progress.completed[activeLevel.id] = true;
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, selectedLevelIndex + 2));
    writeProgress(); refreshMenu();
  }

  function updateHud() {
    ui.loop.textContent = `${String(game.loop).padStart(2, "0")} / ${String(activeLevel.maxLoops).padStart(2, "0")}`;
    ui.echoes.textContent = String(game.echoes.length).padStart(2, "0");
    const remaining = Math.max(0, activeLevel.loopDuration - game.loopTime);
    ui.timer.textContent = remaining.toFixed(1);
    ui.timerChip.classList.toggle("danger", remaining < 8);
    ui.alert.style.width = `${game.detection * 100}%`;
    const guardOnSignal = game.guards.some((guard) => guard.mode === "echoChase" || guard.mode === "scan");
    const alertText = game.detection > .72 ? "Compromised" : game.detection > .3 ? "Tracing" : game.spotted ? "Spotted" : guardOnSignal ? `Signal sync ${game.distractedGuards.size}/${Math.max(1, distractionGoal())}` : "Hidden";
    ui.alertState.textContent = alertText;
    ui.alertState.style.color = game.detection > .3 ? COLORS.red : guardOnSignal ? COLORS.cyan : COLORS.green;
    ui.alertCard.classList.toggle("hot", game.detection > .7);
    ui.echoSlots.forEach((slot, index) => slot.classList.toggle("active", index < game.echoes.length));
  }

  function roundRectPath(context, x, y, w, h, radius) {
    const r = Math.min(radius, Math.abs(w) * .5, Math.abs(h) * .5);
    context.beginPath(); context.moveTo(x + r, y); context.arcTo(x + w, y, x + w, y + h, r); context.arcTo(x + w, y + h, x, y + h, r); context.arcTo(x, y + h, x, y, r); context.arcTo(x, y, x + w, y, r); context.closePath();
  }

  function drawBackground() {
    const gradient = ctx.createRadialGradient(viewW * .52, viewH * .45, 0, viewW * .5, viewH * .5, Math.max(viewW, viewH) * .75);
    gradient.addColorStop(0, "#13243a"); gradient.addColorStop(.45, "#070d17"); gradient.addColorStop(1, "#020306");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, viewW, viewH);
    ctx.strokeStyle = "rgba(100,190,230,.035)"; ctx.lineWidth = 1;
    const step = 48, ox = (worldTime * 4) % step;
    for (let x = -step + ox; x < viewW + step; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, viewH); ctx.stroke(); }
    for (let y = -step + ox; y < viewH + step; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(viewW, y); ctx.stroke(); }
  }

  function drawFloor() {
    ctx.save(); ctx.shadowColor = "#000"; ctx.shadowBlur = 55; ctx.shadowOffsetY = 20;
    roundRectPath(ctx, FLOOR.x, FLOOR.y, FLOOR.w, FLOOR.h, 18); ctx.fillStyle = "#09111b"; ctx.fill(); ctx.restore();
    for (const room of ROOMS) {
      const gradient = ctx.createLinearGradient(room.x, room.y, room.x + room.w, room.y + room.h);
      gradient.addColorStop(0, room.color); gradient.addColorStop(1, "#060b12");
      ctx.fillStyle = gradient; ctx.fillRect(room.x, room.y, room.w, room.h);
      ctx.strokeStyle = room.accent; ctx.globalAlpha = .25; ctx.lineWidth = 1;
      for (let x = room.x + 18; x < room.x + room.w; x += 52) { ctx.beginPath(); ctx.moveTo(x, room.y); ctx.lineTo(x, room.y + room.h); ctx.stroke(); }
      for (let y = room.y + 18; y < room.y + room.h; y += 52) { ctx.beginPath(); ctx.moveTo(room.x, y); ctx.lineTo(room.x + room.w, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = `${room.accent}88`; ctx.font = "900 13px Avenir Next,system-ui"; ctx.letterSpacing = "3px"; ctx.fillText(room.label, room.x + 23, room.y + 32);
    }
    ctx.strokeStyle = "#b7e8ff1c"; ctx.lineWidth = 2; roundRectPath(ctx, FLOOR.x, FLOOR.y, FLOOR.w, FLOOR.h, 18); ctx.stroke();
  }

  function drawProps() {
    for (const prop of PROPS) {
      ctx.save(); ctx.translate(prop.x, prop.y);
      ctx.shadowColor = "#000a"; ctx.shadowBlur = 13; ctx.shadowOffsetY = 6;
      roundRectPath(ctx, 0, 0, prop.w, prop.h, prop.type === "vault" ? 10 : 5);
      const gradient = ctx.createLinearGradient(0, 0, 0, prop.h);
      if (prop.type === "server") { gradient.addColorStop(0, "#20313b"); gradient.addColorStop(1, "#0d151c"); }
      else if (prop.type === "vault") { gradient.addColorStop(0, "#463a26"); gradient.addColorStop(1, "#18140f"); }
      else { gradient.addColorStop(0, "#26313c"); gradient.addColorStop(1, "#111820"); }
      ctx.fillStyle = gradient; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = "#c5efff25"; ctx.stroke();
      if (prop.type === "server") {
        for (let y = 13; y < prop.h - 7; y += 13) { ctx.fillStyle = (Math.floor(worldTime * 3 + y) % 3) ? "#56f4cf" : "#ffb95b"; ctx.fillRect(9, y, 4, 2); ctx.fillStyle = "#7591a233"; ctx.fillRect(20, y, prop.w - 29, 2); }
      } else if (prop.type === "vault") {
        ctx.strokeStyle = "#d4a95288"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(prop.w * .5, prop.h * .5, 19, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(prop.w * .5, prop.h * .5 - 15); ctx.lineTo(prop.w * .5, prop.h * .5 + 15); ctx.moveTo(prop.w * .5 - 15, prop.h * .5); ctx.lineTo(prop.w * .5 + 15, prop.h * .5); ctx.stroke();
      } else { ctx.fillStyle = "#69d9e722"; ctx.fillRect(8, 8, prop.w - 16, 6); }
      ctx.restore();
    }
  }

  function drawVisionCone(observer, range, fov, color) {
    const rays = 28;
    ctx.beginPath(); ctx.moveTo(observer.x, observer.y);
    for (let i = 0; i <= rays; i++) {
      const angle = observer.angle - fov + fov * 2 * (i / rays);
      const length = rayDistance(observer.x, observer.y, angle, range);
      ctx.lineTo(observer.x + Math.cos(angle) * length, observer.y + Math.sin(angle) * length);
    }
    ctx.closePath();
    const gradient = ctx.createRadialGradient(observer.x, observer.y, 4, observer.x, observer.y, range);
    gradient.addColorStop(0, color.replace("ALPHA", game.detection > .5 ? ".24" : ".13"));
    gradient.addColorStop(.7, color.replace("ALPHA", game.detection > .5 ? ".1" : ".045"));
    gradient.addColorStop(1, color.replace("ALPHA", "0"));
    ctx.fillStyle = gradient; ctx.fill();
  }

  function drawSecurity() {
    for (const guard of game.guards) drawVisionCone(guard, 270, .52, "rgba(255,82,109,ALPHA)");
    for (const cameraUnit of game.cameras) {
      drawVisionCone(cameraUnit, cameraUnit.range, cameraUnit.fov, "rgba(255,189,92,ALPHA)");
      ctx.save(); ctx.translate(cameraUnit.x, cameraUnit.y); ctx.rotate(cameraUnit.angle);
      ctx.fillStyle = "#111d29"; ctx.strokeStyle = "#ffbd5c99"; ctx.lineWidth = 2;
      roundRectPath(ctx, -15, -10, 31, 20, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = game.spotted ? COLORS.red : COLORS.amber; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(11, 0, 4, 0, TAU); ctx.fill(); ctx.restore();
    }
  }

  function drawTerminal() {
    const active = game.terminalActive;
    ctx.save(); ctx.translate(TERMINAL.x, TERMINAL.y);
    ctx.shadowColor = active ? COLORS.pink : "#000"; ctx.shadowBlur = active ? 28 : 15;
    ctx.fillStyle = "#0b121e"; ctx.strokeStyle = active ? COLORS.pink : "#6c7890"; ctx.lineWidth = 3;
    roundRectPath(ctx, -40, -28, 80, 56, 10); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = active ? "#ff88d4" : "#35465a"; ctx.fillRect(-29, -15, 58, 22);
    ctx.strokeStyle = active ? "#ffd2ed" : "#70869b"; ctx.lineWidth = 2;
    const wave = worldTime * 2.6;
    ctx.beginPath(); for (let x = -24; x <= 24; x += 4) { const y = Math.sin(x * .2 + wave) * 5; if (x === -24) ctx.moveTo(x, y - 4); else ctx.lineTo(x, y - 4); } ctx.stroke();
    ctx.fillStyle = active ? COLORS.pink : "#4f5f70"; ctx.beginPath(); ctx.arc(0, 18, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = active ? "#ff6ac788" : "#70809633"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, TERMINAL.r + Math.sin(worldTime * 3) * 3, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function drawSyncPad() {
    const active = game.plateActive;
    ctx.save(); ctx.translate(SYNC_PAD.x, SYNC_PAD.y);
    ctx.fillStyle = active ? "#4c3214" : "#171713"; ctx.strokeStyle = active ? COLORS.amber : "#695e46"; ctx.lineWidth = 4;
    ctx.shadowColor = active ? COLORS.amber : "transparent"; ctx.shadowBlur = active ? 35 : 0;
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = active ? "#ffe1a0" : "#4f4a3e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 24 + Math.sin(worldTime * 4) * 2, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 29, Math.sin(a) * 29); ctx.lineTo(Math.cos(a) * 36, Math.sin(a) * 36); ctx.stroke(); }
    ctx.restore();
  }

  function drawLaserGate(gate) {
    if (game.terminalActive) {
      ctx.save(); ctx.strokeStyle = "#ff67c52a"; ctx.setLineDash([5, 9]); ctx.strokeRect(gate.x + 8, gate.y, Math.max(3, gate.w - 16), gate.h); ctx.restore(); return;
    }
    ctx.save(); ctx.shadowColor = COLORS.pink; ctx.shadowBlur = 18; ctx.strokeStyle = COLORS.pink; ctx.lineWidth = 3;
    for (let y = gate.y + 8; y < gate.y + gate.h; y += 22) { const flicker = .72 + Math.sin(worldTime * 17 + y) * .22; ctx.globalAlpha = flicker; ctx.beginPath(); ctx.moveTo(gate.x + 3, y); ctx.lineTo(gate.x + gate.w - 3, y); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = "#ff8dd7"; ctx.fillRect(gate.x - 4, gate.y - 7, 8, gate.h + 14); ctx.fillRect(gate.x + gate.w - 4, gate.y - 7, 8, gate.h + 14); ctx.restore();
  }

  function drawPulseFields() {
    for (const field of activeLevel.pulseFields) {
      const active = pulseFieldActive(field);
      const warning = pulseFieldWarning(field);
      const cycle = ((game.loopTime + field.phase) % field.period) / field.period;
      const color = active ? COLORS.red : warning ? COLORS.amber : "#853843";
      ctx.save(); ctx.globalAlpha = active ? .78 : warning ? .58 : .24; ctx.fillStyle = active ? "#ff314f35" : warning ? "#ffbd5c2d" : "#8e27301f";
      ctx.shadowColor = active || warning ? color : "transparent"; ctx.shadowBlur = active ? 25 : warning ? 18 : 0;
      ctx.fillRect(field.x, field.y, field.w, field.h); ctx.shadowBlur = 0;
      ctx.strokeStyle = active ? "#ff6479" : warning ? "#ffd27d" : "#853843"; ctx.lineWidth = active || warning ? 3 : 1.5; ctx.strokeRect(field.x, field.y, field.w, field.h);
      ctx.globalAlpha = active ? .65 : warning ? .52 : .18; ctx.strokeStyle = active ? "#ffd5db" : warning ? "#fff0b8" : "#a35b65"; ctx.lineWidth = 2;
      for (let x = field.x - field.h; x < field.x + field.w; x += 24) { ctx.beginPath(); ctx.moveTo(x + cycle * 24, field.y + field.h); ctx.lineTo(x + field.h + cycle * 24, field.y); ctx.stroke(); }
      ctx.restore();
    }
  }

  function drawPortals() {
    for (const portal of activeLevel.portals) {
      for (const endpoint of [portal.a, portal.b]) {
        ctx.save(); ctx.translate(endpoint.x, endpoint.y); ctx.rotate(worldTime * 1.5);
        ctx.shadowColor = portal.color; ctx.shadowBlur = 28; ctx.strokeStyle = portal.color; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(worldTime * 4) * 3, .25, TAU - .25); ctx.stroke();
        ctx.globalAlpha = .65; ctx.lineWidth = 2; ctx.setLineDash([5, 9]); ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.stroke(); ctx.restore();
      }
    }
  }

  function drawBaitZones() {
    let number = 0;
    for (const guard of game.guards) {
      if (!guard.required || !guard.bait) continue;
      number += 1;
      const complete = game.distractedGuards.has(guard.index);
      const color = complete ? COLORS.green : COLORS.cyan;
      const pulse = Math.sin(worldTime * 5 + number) * 4;
      ctx.save(); ctx.translate(guard.bait.x, guard.bait.y);
      ctx.fillStyle = complete ? "#77ff9a16" : "#66f7ff10"; ctx.beginPath(); ctx.arc(0, 0, guard.bait.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = complete ? 4 : 2.5; ctx.shadowColor = color; ctx.shadowBlur = complete ? 20 : 12;
      ctx.setLineDash(complete ? [] : [9, 10]); ctx.lineDashOffset = -worldTime * 24; ctx.beginPath(); ctx.arc(0, 0, guard.bait.r + pulse, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.shadowBlur = 0; ctx.fillStyle = "#06121de6"; ctx.strokeStyle = `${color}99`; roundRectPath(ctx, -42, -12, 84, 24, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.font = "1000 8px Avenir Next,system-ui"; ctx.textAlign = "center"; ctx.fillText(`SIGNAL ${String(number).padStart(2, "0")}${complete ? " ✓" : ""}`, 0, 3); ctx.restore();
    }
  }

  function drawShards() {
    for (const shard of game.shards) {
      if (shard.collected) continue;
      const pulse = 1 + Math.sin(worldTime * 5 + shard.index) * .12;
      ctx.save(); ctx.translate(shard.x, shard.y); ctx.rotate(worldTime * .85 + shard.index); ctx.scale(pulse, pulse);
      ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = 25; ctx.fillStyle = "#9dffff"; ctx.strokeStyle = "#efffff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(13, -4); ctx.lineTo(7, 17); ctx.lineTo(-12, 10); ctx.lineTo(-14, -8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  function drawVaultGate() {
    const amount = ease(game.doorAmount);
    const half = VAULT_GATE.h * .5 * (1 - amount);
    ctx.save(); ctx.shadowColor = "#000"; ctx.shadowBlur = 15;
    const gradient = ctx.createLinearGradient(VAULT_GATE.x, 0, VAULT_GATE.x + VAULT_GATE.w, 0); gradient.addColorStop(0, "#5a4930"); gradient.addColorStop(.5, "#b18b45"); gradient.addColorStop(1, "#47391f");
    ctx.fillStyle = gradient; ctx.strokeStyle = game.doorOpen ? "#ffe09d" : "#977038"; ctx.lineWidth = 2;
    if (half > 1) { ctx.fillRect(VAULT_GATE.x, VAULT_GATE.y, VAULT_GATE.w, half); ctx.fillRect(VAULT_GATE.x, VAULT_GATE.y + VAULT_GATE.h - half, VAULT_GATE.w, half); }
    ctx.shadowBlur = 0; ctx.fillStyle = game.doorOpen ? COLORS.green : COLORS.red; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(VAULT_GATE.x + VAULT_GATE.w / 2, VAULT_GATE.y - 12, 4, 0, TAU); ctx.fill(); ctx.restore();
  }

  function drawCore() {
    if (game.core) return;
    const pulse = 1 + Math.sin(worldTime * 3.5) * .08;
    ctx.save(); ctx.translate(CORE.x, CORE.y); ctx.rotate(worldTime * .55); ctx.scale(pulse, pulse);
    const ready = allShardsCollected();
    ctx.globalAlpha = ready ? 1 : .34; ctx.shadowColor = ready ? COLORS.amber : "#475465"; ctx.shadowBlur = ready ? 38 : 10; ctx.fillStyle = ready ? "#ffd77c" : "#536273";
    ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(23, 0); ctx.lineTo(0, 29); ctx.lineTo(-23, 0); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = "#fff4c9"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#8f5b1a"; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(11, 0); ctx.lineTo(0, 15); ctx.lineTo(-11, 0); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.strokeStyle = "#ffbd5c77"; ctx.lineWidth = 2; ctx.setLineDash([5, 8]); ctx.beginPath(); ctx.arc(CORE.x, CORE.y, 48 + Math.sin(worldTime * 2) * 5, 0, TAU); ctx.stroke(); ctx.restore();
  }

  function drawExit() {
    ctx.save(); ctx.translate(EXIT.x, EXIT.y);
    const ready = game.core; ctx.strokeStyle = ready ? COLORS.green : "#4a5d61"; ctx.fillStyle = ready ? "#24422a55" : "#111b1d88"; ctx.lineWidth = 4;
    ctx.shadowColor = ready ? COLORS.green : "transparent"; ctx.shadowBlur = ready ? 25 : 0;
    ctx.beginPath(); ctx.arc(0, 0, 53, 0, TAU); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.strokeStyle = ready ? "#d7ffb9" : "#46565a"; ctx.lineWidth = 2; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -worldTime * 18; ctx.beginPath(); ctx.arc(0, 0, 39, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ready ? "#e6ffd2" : "#65777a"; ctx.font = "1000 9px Avenir Next,system-ui"; ctx.textAlign = "center"; ctx.fillText("EXTRACT", 0, 4); ctx.restore();
  }

  function drawEchoTrail(echo) {
    const frames = echo.frames; if (frames.length < 2) return;
    ctx.save(); ctx.strokeStyle = echo.color; ctx.globalAlpha = .11; ctx.lineWidth = 3; ctx.setLineDash([3, 12]); ctx.lineDashOffset = -worldTime * 12;
    ctx.beginPath();
    for (let i = 0; i < frames.length; i += Math.max(1, Math.floor(frames.length / 100))) { const frame = frames[i]; if (i === 0) ctx.moveTo(frame.x, frame.y); else ctx.lineTo(frame.x, frame.y); }
    ctx.stroke(); ctx.restore();
  }

  function drawDecoyLinks() {
    for (const guard of game.guards) {
      if (guard.mode !== "echoChase") continue;
      const echo = game.echoStates.find((candidate) => candidate.index === guard.targetEchoIndex);
      if (!echo) continue;
      ctx.save(); ctx.globalAlpha = .62; ctx.strokeStyle = echo.color || COLORS.cyan; ctx.lineWidth = 2; ctx.setLineDash([6, 9]); ctx.lineDashOffset = -worldTime * 22;
      ctx.beginPath(); ctx.moveTo(guard.x, guard.y); ctx.lineTo(echo.x, echo.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.shadowColor = echo.color || COLORS.cyan; ctx.shadowBlur = 16; ctx.strokeStyle = "#d9ffff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(echo.x, echo.y, 27 + Math.sin(worldTime * 8) * 3, 0, TAU); ctx.stroke(); ctx.restore();
    }
  }

  function drawAgent(actor, options = {}) {
    const echo = options.echo, color = options.color || COLORS.cyan;
    const moving = Math.hypot(actor.vx || 0, actor.vy || 0) > 45 || actor.dash;
    const gait = moving ? Math.sin(worldTime * 14 + (options.index || 0)) * 4 : 0;
    ctx.save(); ctx.translate(actor.x, actor.y);
    if (echo) { ctx.globalAlpha = .53; ctx.shadowColor = color; ctx.shadowBlur = 24; }
    else { ctx.shadowColor = "#000c"; ctx.shadowBlur = 10; ctx.fillStyle = "#0007"; ctx.beginPath(); ctx.ellipse(4, 8, 22, 12, 0, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
    ctx.rotate(actor.angle || 0);
    ctx.fillStyle = echo ? color : "#c9eff3";
    ctx.beginPath(); ctx.ellipse(-6, -10 + gait * .15, 5, 10, -.35, 0, TAU); ctx.ellipse(-6, 10 - gait * .15, 5, 10, .35, 0, TAU); ctx.fill();
    const body = ctx.createLinearGradient(-15, -15, 18, 15);
    if (echo) { body.addColorStop(0, color); body.addColorStop(1, "#183b4b"); }
    else { body.addColorStop(0, "#f2fdff"); body.addColorStop(.45, "#5d879d"); body.addColorStop(1, "#17283a"); }
    ctx.fillStyle = body; ctx.strokeStyle = echo ? "#dcffff" : "#9ceeff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-14, -15); ctx.quadraticCurveTo(5, -20, 17, -10); ctx.lineTo(20, 10); ctx.quadraticCurveTo(3, 20, -14, 14); ctx.quadraticCurveTo(-22, 0, -14, -15); ctx.fill(); ctx.stroke();
    ctx.fillStyle = echo ? "#d6ffff" : "#07111b"; ctx.beginPath(); ctx.arc(11, 0, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = echo ? color : "#66f7ff"; ctx.shadowColor = color; ctx.shadowBlur = 10; ctx.fillRect(10, -6, 7, 12); ctx.shadowBlur = 0;
    if (!echo && game.core) { ctx.fillStyle = COLORS.amber; ctx.shadowColor = COLORS.amber; ctx.shadowBlur = 13; ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(-2, 0); ctx.lineTo(-10, 5); ctx.lineTo(-17, 0); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }

  function drawGuard(guard) {
    const echoMode = guard.mode === "echoChase" || guard.mode === "scan";
    const chaseMode = guard.mode === "chase";
    const statusColor = chaseMode ? COLORS.red : echoMode ? COLORS.cyan : guard.mode === "investigate" ? COLORS.amber : "#788b9d";
    ctx.save(); ctx.translate(guard.x, guard.y); ctx.rotate(guard.angle);
    ctx.fillStyle = "#0007"; ctx.beginPath(); ctx.ellipse(2, 7, 22, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = chaseMode ? "#4b1720" : echoMode ? "#12394a" : "#26303b"; ctx.strokeStyle = statusColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 19, 16, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#111923"; ctx.beginPath(); ctx.arc(10, 0, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = chaseMode ? COLORS.red : echoMode ? COLORS.cyan : COLORS.amber; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10; ctx.fillRect(12, -6, 6, 12); ctx.shadowBlur = 0;
    ctx.fillStyle = "#727f8b"; ctx.fillRect(-7, -21, 15, 8); ctx.fillRect(-7, 13, 15, 8); ctx.restore();
    if (echoMode) {
      ctx.save(); ctx.translate(guard.x, guard.y - 34); ctx.fillStyle = "#06121ddd"; ctx.strokeStyle = `${COLORS.cyan}99`; roundRectPath(ctx, -28, -9, 56, 18, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c9fdff"; ctx.font = "1000 7px Avenir Next,system-ui"; ctx.textAlign = "center"; ctx.fillText(guard.mode === "scan" ? "SCANNING" : "TRACKING", 0, 3); ctx.restore();
    }
  }

  function drawWalls() {
    for (const wall of WALLS) {
      ctx.save(); ctx.shadowColor = "#000c"; ctx.shadowBlur = 13; ctx.shadowOffsetY = 7;
      const gradient = ctx.createLinearGradient(wall.x, wall.y, wall.x, wall.y + wall.h);
      gradient.addColorStop(0, "#314253"); gradient.addColorStop(.18, "#1a2836"); gradient.addColorStop(1, "#080d14");
      ctx.fillStyle = gradient; ctx.fillRect(wall.x, wall.y, wall.w, wall.h); ctx.shadowBlur = 0; ctx.strokeStyle = "#b9e9ff26"; ctx.strokeRect(wall.x + .5, wall.y + .5, wall.w - 1, wall.h - 1);
      ctx.fillStyle = "#9bdcf544"; ctx.fillRect(wall.x + 4, wall.y + 4, Math.max(0, wall.w - 8), 2); ctx.restore();
    }
  }

  function drawParticles() {
    ctx.save();
    for (const particle of game.particles) { ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); ctx.fillStyle = particle.color; ctx.shadowColor = particle.color; ctx.shadowBlur = 9; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size * (particle.life / particle.maxLife), 0, TAU); ctx.fill(); }
    for (const ring of game.rings) { ctx.globalAlpha = clamp(ring.life / ring.maxLife, 0, 1); ctx.strokeStyle = ring.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }

  function drawWorldLabels() {
    const p = game.player;
    if (state === "playing" || state === "countdown") {
      if (dist(p, TERMINAL) < 110 && !game.terminalActive) drawPrompt(TERMINAL.x, TERMINAL.y - 66, "HOLD", "E", COLORS.pink);
      if (!game.core && allShardsCollected() && dist(p, CORE) < 115) drawPrompt(CORE.x, CORE.y - 72, `STEAL ${Math.round(game.coreCharge * 100)}%`, "E", COLORS.amber);
      if (game.objectiveTarget) drawObjectiveMarker(game.objectiveTarget.x, game.objectiveTarget.y);
      if (game.rewindHold > 0) {
        ctx.save(); ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 4; ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(game.rewindHold / .46, 0, 1)); ctx.stroke(); ctx.restore();
      }
    }
  }

  function drawPrompt(x, y, text, key, color) {
    ctx.save(); ctx.translate(x, y); ctx.font = "1000 9px Avenir Next,system-ui"; ctx.textAlign = "center";
    const width = ctx.measureText(`${key}  ${text}`).width + 26; ctx.fillStyle = "#050a12e8"; ctx.strokeStyle = `${color}88`; roundRectPath(ctx, -width / 2, -14, width, 28, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color; ctx.fillText(`${key}  ${text}`, 0, 4); ctx.restore();
  }

  function drawObjectiveMarker(x, y) {
    const pulse = Math.sin(worldTime * 4) * 5;
    ctx.save(); ctx.translate(x, y - 74 - pulse); ctx.fillStyle = COLORS.cyan; ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = 13;
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-7, -1); ctx.lineTo(7, -1); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = .5; ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 4, 14, 0, TAU); ctx.stroke(); ctx.restore();
  }

  function drawScreenObjective() {
    if ((state !== "playing" && state !== "countdown") || !game.objectiveTarget) return;
    const sx = (game.objectiveTarget.x - camera.x) * camera.zoom;
    const sy = (game.objectiveTarget.y - camera.y) * camera.zoom;
    const margin = 78;
    if (sx > margin && sx < viewW - margin && sy > 145 && sy < viewH - margin) return;
    const x = clamp(sx, margin, viewW - margin), y = clamp(sy, 145, viewH - margin);
    const angle = Math.atan2(sy - y, sx - x);
    const meters = Math.max(1, Math.round(dist(game.player, game.objectiveTarget) / 10));
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = 14; ctx.fillStyle = COLORS.cyan;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-7, -9); ctx.lineTo(-3, 0); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x, y + 24); ctx.fillStyle = "#06101ddd"; roundRectPath(ctx, -25, -10, 50, 20, 5); ctx.fill();
    ctx.fillStyle = "#bffcff"; ctx.font = "900 8px Avenir Next,system-ui"; ctx.textAlign = "center"; ctx.fillText(`${meters}M`, 0, 3); ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();
    const shakeX = reducedMotion ? 0 : (Math.random() - .5) * camera.shake;
    const shakeY = reducedMotion ? 0 : (Math.random() - .5) * camera.shake;
    ctx.save(); ctx.translate(shakeX, shakeY); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y);
    drawFloor(); drawPulseFields(); drawPortals(); drawProps(); drawBaitZones(); drawSecurity();
    game.echoes.forEach(drawEchoTrail); drawDecoyLinks();
    drawTerminal(); drawSyncPad(); drawExit(); drawCore(); drawShards(); LASER_GATES.forEach(drawLaserGate); drawVaultGate();
    for (const echo of game.echoStates) drawAgent(echo, { echo: true, color: echo.color, index: echo.index });
    game.guards.forEach(drawGuard);
    if (game.player) drawAgent(game.player);
    drawWalls(); drawParticles(); drawWorldLabels();
    ctx.restore();
    drawScreenObjective();
    if (state === "rewinding") {
      const amount = clamp(game.rewindTime / .66, 0, 1);
      ctx.fillStyle = `rgba(103,245,255,${Math.sin(amount * Math.PI) * .16})`; ctx.fillRect(0, 0, viewW, viewH);
      ctx.strokeStyle = `rgba(184,255,255,${(1 - amount) * .35})`; ctx.lineWidth = 1;
      for (let y = (worldTime * 900) % 36; y < viewH; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(viewW, y - 8); ctx.stroke(); }
    }
  }

  function tick(now) {
    const dt = Math.min(.033, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    if (state !== "paused") worldTime += dt;
    if (state === "countdown") updateCountdown(dt);
    else if (state === "playing") updatePlaying(dt);
    else if (state === "rewinding") { game.rewindTime += dt; if (game.rewindTime >= .66) completeRewind(); }
    else if (state === "success") { game.successTime += dt; if (game.successTime >= .9) endMission(true); }
    if (state !== "paused") { updateEffects(dt); updateCamera(dt); }
    if (!ui.hud.hidden) updateHud();
    render(); input.pressed.clear(); requestAnimationFrame(tick);
  }

  $("playButton").addEventListener("click", startMission);
  $("helpPlayButton").addEventListener("click", startMission);
  $("helpButton").addEventListener("click", () => { audio.sfx("ui"); showOnly(ui.help); $("helpPlayButton").focus({ preventScroll: true }); });
  $("helpBackButton").addEventListener("click", () => { audio.sfx("ui"); showOnly(ui.menu); $("helpButton").focus({ preventScroll: true }); });
  $("signalTutorialReplayButton").addEventListener("click", () => { audio.sfx("ui"); showSignalTutorial(); });
  $("signalTutorialStart").addEventListener("click", confirmSignalTutorial);
  $("signalTutorialBack").addEventListener("click", () => { audio.sfx("ui"); showOnly(ui.menu); $("playButton").focus({ preventScroll: true }); });
  $("pauseButton").addEventListener("click", pauseGame);
  $("resumeButton").addEventListener("click", () => { audio.sfx("ui"); resumeGame(); });
  $("restartButton").addEventListener("click", startMission);
  $("quitButton").addEventListener("click", openMenu);
  $("replayButton").addEventListener("click", startMission);
  $("resultMenuButton").addEventListener("click", openMenu);
  ui.next.addEventListener("click", () => { if (selectLevel(selectedLevelIndex + 1)) startMission(); });
  ui.levelButtons.forEach((button, index) => button.addEventListener("click", () => { audio.sfx("ui"); selectLevel(index); }));
  ui.sound.addEventListener("click", () => audio.toggle());

  if (location.hostname === "127.0.0.1" || location.hostname === "localhost" || location.protocol === "file:") {
    Object.defineProperty(window, "__echoHeistDebug", {
      configurable: true,
      value: {
        game, input, levels: LEVELS, constants: { WORLD_W, WORLD_H, LOOP_DURATION, MAX_LOOPS, TERMINAL, SYNC_PAD, CORE, EXIT, LASER_GATE, VAULT_GATE, WALLS, PROPS },
        getState: () => state,
        getLevel: () => activeLevel,
        selectLevel: (index) => selectLevel(index, true),
        setState: (nextState) => { state = nextState; },
        resetMission, resetLoop, startMission, confirmSignalTutorial, signalTutorialSeen, updatePlayer, updateDevices, updateGuards, updateObjective, updatePlaying,
        recordFrame, sampleEcho, beginRewind, completeRewind, collectCore, finishEscape, endMission, formatTime, render,
        guardCanSee, guardCanNoticeEcho, lineBlocked, colliders, moveCircle, distractionGoal, distractionsReady, creditSentryDistraction,
        setEchoes: (echoes) => { game.echoes = echoes; game.echoStates = game.echoes.map((echo) => sampleEcho(echo, game.loopTime)).filter(Boolean); },
        syncEchoStates: (time = game.loopTime) => { game.echoStates = game.echoes.map((echo) => sampleEcho(echo, time)).filter(Boolean); return game.echoStates; },
        setPlayer: (x, y) => { game.player.x = x; game.player.y = y; game.player.vx = 0; game.player.vy = 0; },
        setHeld: (code, held) => { if (held) input.held.add(code); else input.held.delete(code); }
      }
    });
  }

  progress = readProgress();
  const linkedLevelIndex = requestedLevelIndex();
  selectLevel(linkedLevelIndex >= 0 ? linkedLevelIndex : progress.selected, true);
  loadBest();
  updateObjective();
  requestAnimationFrame(tick);
})();
