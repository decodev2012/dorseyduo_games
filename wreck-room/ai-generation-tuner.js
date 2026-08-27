#!/usr/bin/env node
'use strict';

/*
 * Wreck Room bot policy tuner
 * ----------------------------
 * A deliberately small, reproducible evolutionary search.  It evaluates
 * driving policies against moving targets in all three shipped arena layouts,
 * rewarding clean intercepts and rams while punishing wall / obstacle hits.
 *
 * Run from the repository root:
 *   node wreck-room/ai-generation-tuner.js
 *
 * The printed champion is copied into AI_PROFILE in index.html.  There are no
 * dependencies and the fixed seed means a future tune is auditable and gives
 * the same answer on every machine.
 */

const SEED = 0x57ec2026;
const GENERATIONS = 36;
const POPULATION = 42;
const ELITES = 6;

const ARENAS = [
  {name: 'scrap', w: 2900, h: 1850, obstacles: [
    [540,330,430,110],[1770,300,560,110],[1180,720,110,440],[2090,940,120,470],
    [480,1300,570,110],[1480,1450,480,110],[2450,1290,170,140],[360,830,175,150]
  ], starts: [[300,310],[2600,1520],[300,1540],[2600,300]]},
  {name: 'reactor', w: 2700, h: 1820, obstacles: [
    [500,360,160,350],[2040,360,160,350],[500,1110,160,350],[2040,1110,160,350],
    [930,340,760,75],[930,1405,760,75]
  ], starts: [[310,300],[2380,1500],[310,1500],[2380,300]]},
  {name: 'skyway', w: 3050, h: 1680, obstacles: [
    [380,390,720,115],[1910,390,720,115],[560,1120,520,115],[1980,1120,520,115],
    [1390,640,170,400],[145,690,260,250],[2650,730,260,250]
  ], starts: [[280,260],[2770,1430],[280,1430],[2770,260]]}
];

const GENES = {
  steerGain: [2.15, 3.85],
  interceptTime: [0.36, 0.96],
  routePad: [56, 108],
  avoidWeight: [0.88, 1.78],
  turnBrake: [0.16, 0.58],
  driftTurn: [0.76, 1.42],
  boostFacing: [0.84, 0.955],
  boostRange: [760, 1260],
  boostReserve: [1, 14],
  pickupBias: [0.38, 1.24],
  flankDistance: [145, 315],
  recoveryTime: [0.58, 1.20]
};

function rng(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function hypot(x, y) { return Math.hypot(x, y); }
function angleDiff(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function randomProfile(random) {
  const p = {};
  for (const [key, range] of Object.entries(GENES)) p[key] = range[0] + random() * (range[1] - range[0]);
  return p;
}
function mutate(parent, random, scale) {
  const child = {};
  for (const [key, range] of Object.entries(GENES)) {
    const span = range[1] - range[0];
    const noise = (random() + random() + random() + random() - 2) * span * scale;
    child[key] = clamp(parent[key] + noise, range[0], range[1]);
  }
  return child;
}
function pointRectDistance(x, y, r) {
  const qx = clamp(x, r[0], r[0] + r[2]);
  const qy = clamp(y, r[1], r[1] + r[3]);
  return hypot(x - qx, y - qy);
}
function segmentHitsRect(a, b, r, pad) {
  const left = r[0] - pad, right = r[0] + r[2] + pad;
  const top = r[1] - pad, bottom = r[1] + r[3] + pad;
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - left, right - a.x, a.y - top, bottom - a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 0.00001) { if (q[i] < 0) return false; }
    else {
      const u = q[i] / p[i];
      if (p[i] < 0) { if (u > t1) return false; if (u > t0) t0 = u; }
      else { if (u < t0) return false; if (u < t1) t1 = u; }
    }
  }
  return t0 < .98 && t1 > .02;
}
function clearRoute(arena, a, b, pad) {
  return !arena.obstacles.some(r => segmentHitsRect(a, b, r, pad));
}
function bestCornerGoal(arena, from, to, pad) {
  let best = null;
  for (const r of arena.obstacles) {
    if (!segmentHitsRect(from, to, r, pad)) continue;
    for (const corner of [[r[0]-pad,r[1]-pad],[r[0]+r[2]+pad,r[1]-pad],[r[0]-pad,r[1]+r[3]+pad],[r[0]+r[2]+pad,r[1]+r[3]+pad]]) {
      const p = {x: clamp(corner[0], 80, arena.w - 80), y: clamp(corner[1], 80, arena.h - 80)};
      if (!clearRoute(arena, from, p, pad * .35)) continue;
      const score = hypot(p.x - from.x, p.y - from.y) + hypot(to.x - p.x, to.y - p.y);
      if (!best || score < best.score) best = {x: p.x, y: p.y, score};
    }
  }
  return best;
}
function simulateEpisode(profile, arena, startIndex, seed) {
  const random = rng(seed);
  const start = arena.starts[startIndex % arena.starts.length];
  const end = arena.starts[(startIndex + 1) % arena.starts.length];
  const bot = {x: start[0], y: start[1], a: Math.atan2(end[1]-start[1], end[0]-start[0]), speed: 0, boost: 100, route: null, stuck: 0, reverse: 0};
  const target = {x: end[0], y: end[1], vx: 0, vy: 0, phase: random() * 6.28};
  const pickups = [{x: arena.w*.5, y: arena.h*.5}, {x: arena.w*.24, y: arena.h*.75}, {x: arena.w*.76, y: arena.h*.25}];
  let score = 0, hits = 0, wallHits = 0, closeTime = 0, dt = 1/30;
  for (let frame = 0; frame < 30 * 18; frame++) {
    const time = frame * dt;
    // A reproducible evasive driver: it travels through broad arcs so the
    // trainer has to solve both pursuit and obstacle detours.
    const tx = arena.w * (.5 + .36 * Math.cos(time*.27 + target.phase));
    const ty = arena.h * (.5 + .31 * Math.sin(time*.34 + target.phase*.73));
    const ta = Math.atan2(ty-target.y, tx-target.x);
    target.vx = Math.cos(ta) * 208; target.vy = Math.sin(ta) * 208;
    target.x = clamp(target.x + target.vx*dt, 90, arena.w-90);
    target.y = clamp(target.y + target.vy*dt, 90, arena.h-90);

    const dx = target.x-bot.x, dy = target.y-bot.y, d = hypot(dx,dy);
    const lead = clamp(d / Math.max(280, bot.speed + 230), .16, profile.interceptTime);
    let goal = {x: target.x + target.vx*lead, y: target.y + target.vy*lead};
    // Every other scenario is a wingman run.  It must set up a side angle
    // first instead of blindly following the lead driver into the same bumper.
    if (startIndex % 2 && d > 175) {
      const tv = hypot(target.vx, target.vy) || 1;
      const side = startIndex % 4 < 2 ? 1 : -1;
      goal.x += -target.vy/tv * profile.flankDistance * side;
      goal.y += target.vx/tv * profile.flankDistance * side;
    }
    const lowBoost = bot.boost < 34;
    let nearestPickup = pickups[0], pickupDistance = Infinity;
    for (const pickup of pickups) { const pd = hypot(pickup.x-bot.x,pickup.y-bot.y); if (pd < pickupDistance) { nearestPickup=pickup; pickupDistance=pd; } }
    if (lowBoost && pickupDistance < d * profile.pickupBias && clearRoute(arena, bot, nearestPickup, 42)) goal = nearestPickup;
    if (!clearRoute(arena, bot, goal, profile.routePad)) goal = bestCornerGoal(arena, bot, goal, profile.routePad) || goal;
    let avoidX = 0, avoidY = 0;
    for (const r of arena.obstacles) {
      const qx = clamp(bot.x, r[0], r[0]+r[2]), qy=clamp(bot.y,r[1],r[1]+r[3]);
      let ax=bot.x-qx, ay=bot.y-qy, ad=hypot(ax,ay);
      if (ad < 150) {
        if (ad < .001) { const ds=[Math.abs(bot.x-r[0]),Math.abs(bot.x-(r[0]+r[2])),Math.abs(bot.y-r[1]),Math.abs(bot.y-(r[1]+r[3]))]; const k=ds.indexOf(Math.min(...ds)); ax=k===0?-1:k===1?1:0; ay=k===2?-1:k===3?1:0; ad=1; }
        const w=(1-ad/150)*profile.avoidWeight; avoidX+=ax/ad*w; avoidY+=ay/ad*w;
      }
    }
    if (hypot(avoidX,avoidY)>.001) { goal.x+=avoidX*260; goal.y+=avoidY*260; }
    const desired=Math.atan2(goal.y-bot.y,goal.x-bot.x), diff=angleDiff(desired,bot.a), facing=Math.cos(diff);
    const steer=clamp(diff*profile.steerGain,-1,1);
    let throttle = Math.abs(diff)>1.05 && bot.speed>190 ? profile.turnBrake : 1;
    const drift=Math.abs(diff)>profile.driftTurn&&bot.speed>230;
    const useBoost=facing>profile.boostFacing&&d>155&&d<profile.boostRange&&bot.boost>profile.boostReserve&&clearRoute(arena,bot,target,45);
    if (bot.reverse > 0) { bot.reverse -= dt; throttle = -.72; }
    bot.a += steer*3.0*(.28+Math.min(1,Math.abs(bot.speed)/510)*.86)*dt*(throttle<0?-1:1);
    bot.speed += 525*throttle*dt;
    bot.speed *= Math.max(0,1-(drift?.58:1.24)*dt);
    if (useBoost) { bot.speed += 760*dt; bot.boost = Math.max(0,bot.boost-30*dt); }
    bot.speed = clamp(bot.speed,-220,610);
    bot.x += Math.cos(bot.a)*bot.speed*dt; bot.y += Math.sin(bot.a)*bot.speed*dt;
    let collided=false;
    if (bot.x<36||bot.x>arena.w-36||bot.y<36||bot.y>arena.h-36) { bot.x=clamp(bot.x,36,arena.w-36); bot.y=clamp(bot.y,36,arena.h-36); bot.speed*=.34; wallHits++; collided=true; }
    for (const r of arena.obstacles) if (pointRectDistance(bot.x,bot.y,r)<36) { bot.speed*=.28; wallHits++; collided=true; }
    bot.stuck=collided||Math.abs(bot.speed)<25&&d>220?bot.stuck+dt:Math.max(0,bot.stuck-dt*.6);
    if (bot.stuck>profile.recoveryTime&&bot.reverse<=0) { bot.reverse=.42; bot.stuck=0; }
    for (const pickup of pickups) if (hypot(pickup.x-bot.x,pickup.y-bot.y)<56) bot.boost=Math.min(100,bot.boost+38);
    if (d<112&&facing>.72&&bot.speed>195) { hits++; score+=175+bot.speed*.10; target.x=clamp(target.x+Math.cos(bot.a)*70,80,arena.w-80); target.y=clamp(target.y+Math.sin(bot.a)*70,80,arena.h-80); }
    if (d<250) { closeTime+=dt; score+=2.1; }
    score += Math.max(0, 1-d/2600)*.22;
  }
  return score + hits*85 + closeTime*11 - wallHits*13;
}
function score(profile) {
  let total=0, n=0;
  ARENAS.forEach((arena, ai) => {
    for (let start=0; start<arena.starts.length; start++) {
      total += simulateEpisode(profile, arena, start, SEED + ai*997 + start*71); n++;
    }
  });
  return total/n;
}
function evolve() {
  const random=rng(SEED); let population=Array.from({length:POPULATION},()=>randomProfile(random)); let champion=null;
  for (let generation=0; generation<GENERATIONS; generation++) {
    const ranked=population.map(profile=>({profile,fitness:score(profile)})).sort((a,b)=>b.fitness-a.fitness);
    if (!champion || ranked[0].fitness>champion.fitness) champion={profile:clone(ranked[0].profile),fitness:ranked[0].fitness,generation};
    const next=ranked.slice(0,ELITES).map(x=>clone(x.profile)); const scale=.22*(1-generation/GENERATIONS)+.025;
    while(next.length<POPULATION) { const parent=ranked[Math.floor(Math.pow(random(),.62)*ELITES)].profile; next.push(mutate(parent,random,scale)); }
    population=next;
    if ((generation+1)%6===0||generation===0) console.log('generation '+String(generation+1).padStart(2,'0')+' best '+ranked[0].fitness.toFixed(2));
  }
  return champion;
}
const champion=evolve();
const p=champion.profile;
for (const key of Object.keys(p)) p[key]=Math.round(p[key]*1000)/1000;
console.log('\nChampion from seed 0x'+SEED.toString(16)+' after '+GENERATIONS+' generations:');
console.log(JSON.stringify({generation:champion.generation+1,fitness:Math.round(champion.fitness*100)/100,profile:p},null,2));
console.log('\nPaste this policy into index.html:');
console.log('var AI_PROFILE='+JSON.stringify(p)+';');
