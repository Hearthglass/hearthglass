import { Surface, CLEAR, sprite, bayer, clamp, lerp } from '../../shared/pixel-engine.js';
import { palette, INK, LIGHT } from './palette.js';

const c = name => palette.c(name);

const SEAHORSE_KEY = { y: 'yellow3', Y: 'yellow4', d: 'yellow2', k: 'yellow1', e: 'ink0', f: 'yellow4' };
const SEAHORSE_ROWS = [
  '..yY....',
  '.yYYy...',
  '.yeYyyyk',
  '..ydy...',
  '..yYy...',
  '.kyYyd..',
  'fkyYyyd.',
  '.kyYyyd.',
  '..kyYyd.',
  '..kyyd..',
  '...kyd..',
  '....yd..',
  '...d.y..',
  '...dyd..',
];
const SEAHORSE = sprite(palette, SEAHORSE_KEY, SEAHORSE_ROWS);
const SEAHORSE_FLUTTER = sprite(palette, SEAHORSE_KEY, SEAHORSE_ROWS.map((r, i) => (i === 6 ? '.kyYyyd.' : i === 5 ? 'fkyYyd..' : r)));

const CRAB_KEY = { R: 'orange4', r: 'orange2', O: 'orange3', o: 'orange1', e: 'ink0', s: 'orange2', l: 'orange1', h: 'orange5' };
const CRAB_BODY = [
  '.RR.......RR.',
  'RrR..e.e..RrR',
  '.r...s.s...r.',
  '..rOOhOOOOr..',
  '.rOOOOOOOOOr.',
  '.oOOOOOOOOOo.',
  '..ooooooooo..',
];
const CRAB_LEGS = [
  ['.l.l.l.l.l.l.', 'l.l.l...l.l.l'],
  ['l.l.l...l.l.l', '.l.l.l.l.l.l.'],
];
const crabFrames = CRAB_LEGS.map(legs => sprite(palette, CRAB_KEY, [...CRAB_BODY, ...legs]));
const CRAB_UP = sprite(palette, CRAB_KEY, [
  'RR.........RR',
  'Rr...e.e...rR',
  '.r...s.s...r.',
  '.r.rOOhOOOr.r',
  '..rOOOOOOOOr.',
  '.oOOOOOOOOOo.',
  '..ooooooooo..',
  '.l.l.l.l.l.l.',
  'l.l.l...l.l.l',
]);

export function createCritters(random) {
  const layer = new Surface(48, 40, CLEAR);
  let layout = null, tank = null;
  const seahorse = { x: 0, y: 0, ax: 0, ay: 0, state: 'hold', t: 0, next: 12, dir: 1, fromX: 0, fromY: 0 };
  const jellies = [];
  const crab = { x: 0, y: 0, dir: 1, state: 'walk', t: 0, next: 3, speed: 8, anim: 0, min: 0, max: 0, snap: 0 };
  const octo = { state: 'hidden', t: 0, next: 18, hue: 0, out: 0, glint: 0, x: 0, y: 0 };

  function build(next, tankRef, flora) {
    layout = next; tank = tankRef;
    const { W, H } = layout;
    // seahorse holds on near the left kelp / grass
    seahorse.ax = Math.round(W * 0.29); seahorse.ay = tank.sandAt(W * 0.29) - 12;
    if (seahorse.state === 'hold') { seahorse.x = seahorse.ax; seahorse.y = seahorse.ay; }
    if (!jellies.length) {
      for (let k = 0; k < 2; k++) jellies.push({ x: W * (0.3 + k * 0.4), y: layout.surfaceY + 30 + k * 20, vx: (random() - 0.5) * 3, vy: 0, phase: random(), size: k ? 5 : 6, glow: 0 });
    }
    crab.min = W * 0.3; crab.max = W * 0.72;
    crab.x = clamp(crab.x || W * 0.5, crab.min, crab.max);
    crab.y = tank.sandAt(crab.x);
    octo.x = layout.cave.x; octo.y = layout.cave.y + 2;
  }

  // ---- update --------------------------------------------------------------------------

  function update(dt, time, env) {
    // seahorse: holds on and bobs, now and then drifts upright to a new perch
    seahorse.t += dt;
    if (seahorse.state === 'hold') {
      seahorse.x = seahorse.ax; seahorse.y = seahorse.ay + Math.sin(time * 0.9) * 1.2;
      if ((seahorse.next -= dt) <= 0) {
        seahorse.state = 'drift'; seahorse.t = 0;
        seahorse.fromX = seahorse.x; seahorse.fromY = seahorse.y;
        const tx = clamp(seahorse.ax + (random() - 0.5) * 60, layout.W * 0.25, layout.W * 0.7);
        seahorse.tx = tx; seahorse.ty = tank.sandAt(tx) - 12 - random() * 6;
        seahorse.dir = tx > seahorse.x ? 1 : -1;
      }
    } else {
      const k = clamp(seahorse.t / 9, 0, 1);
      const e = k * k * (3 - 2 * k);
      seahorse.x = lerp(seahorse.fromX, seahorse.tx, e);
      seahorse.y = lerp(seahorse.fromY, seahorse.ty, e) - Math.sin(e * Math.PI) * 14 + Math.sin(time * 1.4) * 0.8;
      if (k >= 1) { seahorse.state = 'hold'; seahorse.ax = seahorse.tx; seahorse.ay = seahorse.ty; seahorse.next = 14 + random() * 20; }
    }
    // jellyfish: pulse up, sink slowly, wander
    for (const j of jellies) {
      j.phase += dt / 1.8;
      const p = j.phase % 1;
      if (p < 0.25) j.vy -= 16 * dt;
      j.vy += 3 * dt;
      j.vy *= Math.exp(-dt * 1.2);
      j.vx += (random() - 0.5) * dt * 2;
      j.vx *= Math.exp(-dt * 0.3);
      for (const cur of env.currents) {
        if (!cur.alive) continue;
        const d = Math.hypot(j.x - cur.x, j.y - cur.y);
        if (d < cur.r) { j.vx += cur.vx * (1 - d / cur.r) * dt * 2; j.vy += cur.vy * (1 - d / cur.r) * dt * 2; }
      }
      j.x += j.vx * dt; j.y += j.vy * dt;
      if (j.x < 10) j.vx += 4 * dt; if (j.x > layout.W - 10) j.vx -= 4 * dt;
      if (j.y < layout.surfaceY + 10) { j.y = layout.surfaceY + 10; j.vy = Math.abs(j.vy); }
      if (j.y > layout.floorY - 40) j.vy -= 10 * dt;
      j.glow = Math.max(0, j.glow - dt * 0.8);
    }
    // crab
    crab.t += dt; crab.snap = Math.max(0, crab.snap - dt);
    if (crab.state === 'walk' || crab.state === 'scuttle') {
      const speed = crab.state === 'scuttle' ? 34 : crab.speed;
      crab.x += crab.dir * speed * dt;
      crab.anim += dt * speed * 0.5;
      if (crab.x < crab.min) { crab.x = crab.min; crab.dir = 1; }
      if (crab.x > crab.max) { crab.x = crab.max; crab.dir = -1; }
      if ((crab.next -= dt) <= 0) {
        crab.state = random() < 0.5 ? 'pick' : 'rest'; crab.t = 0; crab.next = 1.5 + random() * 3;
      }
      // food on the sand nearby is lunch
      for (const f of env.food) {
        if (f.alive && f.landed && Math.abs(f.x - crab.x) < 20) { crab.dir = f.x > crab.x ? 1 : -1; if (Math.abs(f.x - crab.x) < 4) { f.alive = false; crab.snap = 0.4; } }
      }
    } else if (crab.state === 'claws') {
      if (crab.t > 0.8) { crab.state = 'scuttle'; crab.t = 0; crab.next = 1.2; crab.dir = random() < 0.5 ? -1 : 1; }
    } else if ((crab.next -= dt) <= 0) {
      crab.state = 'walk'; crab.next = 2 + random() * 5; if (random() < 0.5) crab.dir *= -1;
    }
    crab.y = tank.sandAt(crab.x);
    // octopus
    octo.t += dt;
    octo.glint = (octo.glint + dt) % 5;
    const outTarget = octo.state === 'out' ? 1 : octo.state === 'peek' ? 0.45 : 0;
    octo.out += (outTarget - octo.out) * (1 - Math.exp(-dt * (octo.state === 'inking' ? 9 : 3)));
    octo.hue = (octo.hue + dt * 0.25) % 1;
    if (octo.state === 'hidden' && (octo.next -= dt) <= 0) { octo.state = 'peek'; octo.t = 0; }
    else if (octo.state === 'peek' && octo.t > 4) { octo.state = random() < 0.5 ? 'out' : 'hidden'; octo.t = 0; octo.next = 20 + random() * 30; }
    else if (octo.state === 'out' && octo.t > 9) { octo.state = 'hidden'; octo.t = 0; octo.next = 25 + random() * 30; }
    else if (octo.state === 'inking' && octo.t > 1.2) { octo.state = 'hidden'; octo.t = 0; octo.next = 30 + random() * 30; }
  }

  // ---- draw ----------------------------------------------------------------------------

  function drawSeahorse(s, time) {
    const img = Math.floor(time * 6) % 2 ? SEAHORSE_FLUTTER : SEAHORSE;
    s.blit(img, Math.round(seahorse.x) - 4, Math.round(seahorse.y) - 7, seahorse.dir < 0);
    // an outline pass is too heavy for eight pixels; a dark edge on the back does it
  }

  function drawJellies(s, time, night) {
    for (const j of jellies) {
      const p = j.phase % 1;
      const squeeze = p < 0.25 ? Math.sin(p / 0.25 * Math.PI) : 0;
      const rx = j.size + 1 - Math.round(squeeze * 2), ry = j.size - 1 + Math.round(squeeze * 1);
      const cx = Math.round(j.x), cy = Math.round(j.y);
      // tentacles trail below, waving with the pulse
      for (let k = 0; k < 6; k++) {
        const bx = cx - rx + 1 + Math.round((k / 5) * (rx * 2 - 2));
        const len = 10 + (k % 3) * 4;
        for (let m = 1; m < len; m++) {
          if (m > 6 && (m + k) % 2) continue;
          const x = bx + Math.sin(time * 2 + k + m * 0.35 - p * 6) * (m * 0.18);
          s.pset(x, cy + 1 + m, m < 5 ? c('jelly2') : c('jelly1'));
        }
      }
      // oral arms: frilly, short, bright
      for (let k = -1; k <= 1; k++) for (let m = 1; m < 6; m++) s.pset(cx + k + Math.round(Math.sin(time * 3 + m + k) * 0.8), cy + m, c('jelly3'));
      // the bell: see-through body, solid rim, bright crown
      for (let y = -ry; y <= 0; y++) {
        const span = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + 0.5) * (ry + 0.5)))));
        for (let x = -span; x <= span; x++) {
          const edge = Math.abs(x) === span || y === -ry || y === 0;
          if (edge) s.pset(cx + x, cy + y, y === -ry || (y < -ry / 2 && Math.abs(x) < rx / 2) ? c('jelly4') : c('jelly3'));
          else s.pmap(cx + x, cy + y, LIGHT.jelly[night ? 2 : 1]);
        }
      }
      // four-leaf gonads
      s.pset(cx - 1, cy - Math.ceil(ry / 2), c('jelly2')); s.pset(cx + 1, cy - Math.ceil(ry / 2), c('jelly2'));
      s.pset(cx, cy - Math.ceil(ry / 2) - 1, c('jelly2')); s.pset(cx, cy - Math.ceil(ry / 2) + 1, c('jelly2'));
    }
  }

  function glowJellies(s, time, night) {
    for (const j of jellies) {
      const strength = night * (0.6 + Math.sin(j.phase * Math.PI * 2) * 0.15) + j.glow;
      if (strength > 0.02) s.glow(j.x, j.y, j.size * 3 + 4, LIGHT.jelly, strength);
    }
  }

  function drawCrab(s) {
    const img = crab.state === 'claws' || crab.snap > 0 ? CRAB_UP : crabFrames[Math.floor(crab.anim) % 2];
    const pick = crab.state === 'pick' && Math.floor(crab.t * 4) % 2;
    s.blit(img, Math.round(crab.x) - 6, Math.round(crab.y) - img.h + 1 + (pick ? 1 : 0));
  }

  function drawOcto(s, time, night) {
    const { x: cx, y: cy } = octo;
    const cave = layout.cave;
    if (octo.out < 0.08) {
      // eyes glinting in the dark
      if (octo.glint > 0.6 && octo.glint < 3.8 && !(octo.glint > 2 && octo.glint < 2.15)) {
        s.pset(cave.x - 2, cave.y + 1, c('yellow3')); s.pset(cave.x + 2, cave.y + 1, c('yellow3'));
      }
      return;
    }
    layer.clear(CLEAR);
    const lx = 24, ly = 26;
    const out = octo.out;
    // camouflage: shifts between red and sand, blushes when startled
    const t = (Math.sin(octo.hue * Math.PI * 2) + 1) / 2;
    const inking = octo.state === 'inking';
    const base = inking ? c('white1') : t > 0.5 ? c('red2') : c('orange2');
    const light = inking ? c('white2') : t > 0.5 ? c('red3') : c('orange3');
    const dark = inking ? c('white0') : t > 0.5 ? c('red1') : c('orange1');
    const rise = Math.round(out * 9);
    const mx = lx, my = ly - rise;
    const sucker = inking ? c('white2') : t > 0.5 ? c('pink4') : c('orange4');
    // eight arms: out of the cave they curl down and outward over the rock, tapering
    if (out > 0.35) {
      const reach = clamp((out - 0.35) / 0.65, 0, 1);
      for (let k = 0; k < 8; k++) {
        const side = k < 4 ? -1 : 1, n = k % 4;
        let x = mx + side * (1 + n * 0.8), y = my + 5;
        let a = side * (0.5 + n * 0.32) + Math.sin(time * 1.1 + k * 1.7) * 0.25;
        const len = Math.round((8 + (n % 2) * 3 + (n === 3 ? -2 : 0)) * reach);
        for (let m = 0; m < len; m++) {
          // the tips curl up at the end like a question mark
          a += side * (m > len * 0.7 ? -0.28 : 0.1) + Math.sin(time * 2 + k + m * 0.45) * 0.07;
          x += Math.sin(a) * 0.95; y += Math.cos(a) * 0.75;
          const thick = m < len * 0.45;
          layer.pset(x, y, base);
          if (thick) layer.pset(x, y + 1, dark);
          if (m % 2 === 1 && m < len - 1) layer.pset(x, y + (thick ? 1 : 0), sucker);
        }
      }
    }
    // mantle: a bulbous hood that sits back and up from the eyes
    layer.ellipse(mx, my - 1, 5, 6, base);
    layer.ellipse(mx + 1, my - 3, 3, 3, light);
    layer.hline(mx - 4, mx + 4, my + 4, base);
    layer.hline(mx - 3, mx + 3, my + 5, dark);
    for (const [dx, dy] of [[-3, -3], [2, -5], [-1, 0], [3, -1], [0, -5]]) layer.pset(mx + dx, my + dy, dark);
    layer.pset(mx + 2, my - 5, inking ? c('white2') : c('white1'));
    // eyes on little bumps, slit pupils
    for (const side of [-1, 1]) {
      const ex = mx + side * 4, ey = my + 2;
      layer.pset(ex, ey - 1, base);
      layer.pset(ex, ey, c('yellow4')); layer.pset(ex - side, ey, c('yellow3'));
      layer.pset(ex - (side > 0 ? 1 : 0), ey, INK);
    }
    layer.outline(INK);
    // clip to the cave mouth while partly in
    const ox = Math.round(cx) - lx, oy = Math.round(cy) - ly + 2;
    for (let y = 0; y < layer.h; y++) for (let x = 0; x < layer.w; x++) {
      const v = layer.data[y * layer.w + x];
      if (v === CLEAR) continue;
      const px = ox + x, py = oy + y;
      const inCave = ((px - cave.x) / (cave.rx + 1)) ** 2 + ((py - cave.y) / (cave.ry + 1)) ** 2 < 1;
      if (out < 0.6 && !inCave) continue;
      s.pset(px, py, inCave && out < 0.9 ? palette.darker[v] : v);
    }
  }

  return {
    build, update, drawSeahorse, drawJellies, glowJellies, drawCrab, drawOcto,
    seahorse, jellies, crab, octo,
    hitJelly(x, y) { return jellies.find(j => Math.abs(x - j.x) < j.size + 3 && y > j.y - j.size - 2 && y < j.y + 14) || null; },
    hitCrab(x, y) { return Math.abs(x - crab.x) < 9 && y > crab.y - 10 && y < crab.y + 2; },
    hitSeahorse(x, y) { return Math.abs(x - seahorse.x) < 6 && Math.abs(y - seahorse.y) < 9; },
    hitCave(x, y) { const cv = layout.cave; return Math.abs(x - cv.x) < cv.rx + 6 && y > cv.y - cv.ry - 10 && y < cv.y + cv.ry + 2; },
    pokeCrab() { crab.state = 'claws'; crab.t = 0; crab.snap = 0.8; },
    pokeJelly(j) { j.vy -= 22; j.glow = 1; j.phase = Math.floor(j.phase); },
    pokeSeahorse() {
      if (seahorse.state === 'hold') seahorse.next = 0;
    },
    pokeOcto() {
      if (octo.state === 'hidden' || octo.state === 'peek') { octo.state = 'out'; octo.t = 0; return 'out'; }
      if (octo.state === 'out') { octo.state = 'inking'; octo.t = 0; return 'ink'; }
      return null;
    },
  };
}
