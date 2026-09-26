import { Surface, CLEAR, bayer, clamp } from '../../shared/pixel-engine.js';
import { palette, INK, FOG } from './palette.js';

const c = name => palette.c(name);

// ---- species: shape and colour, turned into sprite frames ------------------------------

const band = (u, at, half) => Math.abs(u - at) <= half;

export const SPECIES = {
  clown: {
    label: 'clownfish', len: 12, height: 7, tail: 4, tailH: 3, round: 0.7,
    dorsal: { from: 0.3, to: 0.78, h: 2 }, anal: { from: 0.3, to: 0.55, h: 2 }, eye: 0.86,
    color(u, v) {
      if (band(u, 0.2, 0.05) || band(u, 0.52, 0.06) || band(u, 0.8, 0.045)) return 'white2';
      if (band(u, 0.2, 0.1) || band(u, 0.52, 0.12) || band(u, 0.8, 0.09)) return v < -0.3 ? 'orange3' : 'orange2';
      return v < -0.4 ? 'orange4' : v > 0.5 ? 'orange2' : 'orange3';
    },
    fin: (u, edge) => (edge ? 'ink0' : 'orange3'), tailColor: (t, edge) => (edge ? 'ink0' : 'orange3'),
    speed: 16, accel: 3,
  },
  blueTang: {
    label: 'blue tang', len: 15, height: 9, tail: 5, tailH: 4, round: 0.55,
    dorsal: { from: 0.18, to: 0.86, h: 2 }, anal: { from: 0.25, to: 0.72, h: 2 }, eye: 0.84,
    color(u, v) {
      const inBand = v < 0.05 && v > -0.8 && u > 0.14 && u < 0.76;
      const window = u > 0.34 && u < 0.56 && v > -0.55 && v < -0.2;
      if (inBand && !window) return 'ink0';
      if (u < 0.1) return 'yellow3';
      return v < -0.5 ? 'blue4' : v > 0.55 ? 'blue2' : 'blue3';
    },
    fin: (u, edge) => (edge ? 'ink0' : 'blue3'), tailColor: (t, edge) => (edge ? 'ink0' : t > 0.5 ? 'yellow3' : 'yellow2'),
    speed: 24, accel: 2.4,
  },
  yellowTang: {
    label: 'yellow tang', len: 11, height: 11, tail: 4, tailH: 4, round: 0.4, snout: 0.8,
    dorsal: { from: 0.12, to: 0.82, h: 3 }, anal: { from: 0.15, to: 0.78, h: 3 }, eye: 0.74,
    color(u, v) {
      if (u < 0.1 && Math.abs(v) < 0.2) return 'white2';
      return v < -0.55 ? 'yellow4' : v > 0.55 ? 'yellow2' : 'yellow3';
    },
    fin: (u, edge) => (edge ? 'yellow2' : 'yellow3'), tailColor: (t, edge) => (edge ? 'yellow2' : 'yellow3'),
    speed: 20, accel: 2.4,
  },
  idol: {
    label: 'moorish idol', len: 11, height: 10, tail: 4, tailH: 3, round: 0.45, snout: 0.75, forked: true,
    dorsal: { from: 0.42, to: 0.75, h: 9, streamer: true }, anal: { from: 0.35, to: 0.7, h: 4 }, eye: 0.8,
    color(u, v) {
      if (u > 0.9) return v < 0 ? 'orange3' : 'white1';
      if (u > 0.68) return 'ink0';
      if (u > 0.38) return v < -0.2 && u < 0.55 ? 'yellow3' : 'white2';
      if (u > 0.16) return 'ink0';
      return 'yellow3';
    },
    fin: (u, edge) => (edge ? 'ink0' : u > 0.6 ? 'white2' : 'ink0'), tailColor: (t, edge) => (edge ? 'white2' : 'ink0'),
    speed: 15, accel: 2,
  },
  flame: {
    label: 'flame angelfish', len: 10, height: 7, tail: 3, tailH: 3, round: 0.55,
    dorsal: { from: 0.2, to: 0.85, h: 2 }, anal: { from: 0.2, to: 0.75, h: 2 }, eye: 0.84,
    color(u, v) {
      if ((band(u, 0.38, 0.03) || band(u, 0.52, 0.03) || band(u, 0.66, 0.03)) && v < 0.4) return 'red0';
      return v < -0.45 ? 'orange4' : v > 0.4 ? 'red2' : 'red3';
    },
    fin: (u, edge) => (edge ? 'blue3' : 'red2'), tailColor: (t, edge) => (edge ? 'blue3' : 'red3'),
    speed: 17, accel: 3,
  },
  puffer: {
    label: 'pufferfish', len: 11, height: 8, tail: 3, tailH: 2, round: 0.35,
    dorsal: { from: 0.2, to: 0.32, h: 2 }, anal: { from: 0.2, to: 0.3, h: 2 }, eye: 0.8, bigEye: true,
    color(u, v, x, y) {
      if (v > 0.35) return 'white1';
      const spot = ((x * 7 + y * 13) % 9 === 0);
      return spot ? 'sand1' : v < -0.5 ? 'sand5' : 'sand4';
    },
    fin: (u, edge) => (edge ? 'sand2' : 'sand3'), tailColor: (t, edge) => (edge ? 'sand2' : 'sand3'),
    speed: 9, accel: 1.6,
  },
  chromis: {
    label: 'chromis', len: 6, height: 3, tail: 3, tailH: 2, round: 0.6, forked: true,
    dorsal: null, anal: null, eye: 0.85, tiny: true,
    color: (u, v) => (v < 0 ? 'teal4' : 'teal3'),
    fin: () => 'teal2', tailColor: (t, edge) => (edge ? 'teal2' : 'teal3'),
    speed: 26, accel: 4,
  },
};

function makeFrames(spec) {
  const pad = 1;
  const dorsalH = spec.dorsal ? spec.dorsal.h + (spec.dorsal.streamer ? 1 : 0) : 0;
  const analH = spec.anal ? spec.anal.h : 0;
  const w = spec.tail + spec.len + pad * 2 + (spec.dorsal?.streamer ? 0 : 0);
  const h = spec.height + dorsalH + analH + pad * 2 + 2;
  const cy = pad + dorsalH + Math.floor(spec.height / 2) + 1;
  const half = (spec.height - 1) / 2;
  const bodyX = pad + spec.tail;
  const hh = u => {
    let p = Math.pow(Math.sin(Math.PI * clamp(0.06 + u * 0.94, 0, 1)), spec.round);
    if (spec.snout && u > spec.snout) p *= 1 - (u - spec.snout) / (1 - spec.snout) * 0.55;
    return Math.max(0.5, half * p);
  };
  const frames = [];
  for (let f = 0; f < 5; f++) {
    const s = new Surface(w, h, CLEAR);
    const turn = f === 4;
    const wag = [0, 1, 0, -1, 0][f];
    const tailScale = [1, 0.8, 0.55, 0.8, 0.5][f];
    const squeeze = turn ? 0.55 : 1;
    const len = Math.max(3, Math.round(spec.len * squeeze));
    const x0 = bodyX + Math.round((spec.len - len) / 2);
    // fins behind the body first
    if (spec.dorsal && !turn) {
      for (let x = 0; x < len; x++) {
        const u = x / (len - 1);
        const { from, to } = spec.dorsal;
        if (u < from || u > to) continue;
        const k = Math.sin(Math.PI * (u - from) / (to - from));
        const fh = Math.round(spec.dorsal.h * (spec.dorsal.streamer ? Math.pow((u - from) / (to - from), 0.5) * (1 - Math.pow((u - from) / (to - from), 4)) : Math.pow(k, 0.7)));
        const top = cy - Math.round(hh(u));
        for (let k2 = 1; k2 <= fh; k2++) s.pset(x0 + x, top - k2, c(spec.fin(u, k2 === fh)));
      }
      if (spec.dorsal.streamer) {
        // the idol's long trailing filament
        const sx = x0 + Math.round(len * spec.dorsal.from), sy = cy - Math.round(hh(spec.dorsal.from)) - spec.dorsal.h + 1;
        for (let k = 0; k < 9; k++) s.pset(sx - k, sy + Math.round(k * k * 0.06) - (f % 2 && k > 5 ? 1 : 0), c('white2'));
      }
    }
    if (spec.anal && !turn) {
      for (let x = 0; x < len; x++) {
        const u = x / (len - 1);
        const { from, to } = spec.anal;
        if (u < from || u > to) continue;
        const fh = Math.round(spec.anal.h * Math.pow(Math.sin(Math.PI * (u - from) / (to - from)), 0.7));
        const bottom = cy + Math.round(hh(u));
        for (let k2 = 1; k2 <= fh; k2++) s.pset(x0 + x, bottom + k2, c(spec.fin(u, k2 === fh)));
      }
    }
    // tail
    for (let tx = 0; tx < spec.tail; tx++) {
      const t = (tx + 1) / spec.tail;
      const spread = Math.max(0.6, spec.tailH * t * tailScale);
      const yc = cy + Math.round(wag * t);
      const x = x0 - 1 - tx;
      for (let y = -Math.ceil(spread); y <= Math.ceil(spread); y++) {
        if (Math.abs(y) > spread + 0.3) continue;
        if (spec.forked && t > 0.6 && Math.abs(y) < spread * 0.4) continue;
        s.pset(x, yc + y, c(spec.tailColor(t, t === 1 || Math.abs(y) >= Math.ceil(spread))));
      }
    }
    // body
    for (let x = 0; x < len; x++) {
      const u = x / (len - 1);
      const hu = hh(u);
      for (let y = -Math.round(hu); y <= Math.round(hu); y++) {
        const v = y / Math.max(0.5, hu);
        let color = c(spec.color(u, v, x, y));
        if (v < -0.8 && color !== INK) color = palette.lighter[color];
        s.pset(x0 + x, cy + y, color);
      }
    }
    // pectoral fin and gill line
    if (!spec.tiny && !turn) {
      const px = x0 + Math.round(len * 0.66), py = cy + 1;
      s.pset(px, py, palette.darker[s.get(px, py)]);
      s.pset(px - 1, py + 1, palette.darker[s.get(px - 1, py + 1) === CLEAR ? c('white1') : s.get(px - 1, py + 1)]);
    }
    // eye
    const ex = x0 + Math.round((len - 1) * spec.eye), ey = cy - Math.max(0, Math.round(hh(spec.eye) * 0.3));
    if (spec.bigEye) { s.pset(ex, ey, c('white2')); s.pset(ex + 1, ey, INK); s.pset(ex, ey - 1, c('white1')); }
    else if (!spec.tiny) { s.pset(ex, ey, INK); s.pset(ex - 1, ey, s.get(ex - 1, ey) === INK ? INK : c('white2')); }
    else s.pset(ex, ey, INK);
    s.outline(INK);
    frames.push(s);
  }
  return { frames, cy, noseX: bodyX + spec.len, w, h };
}

const FRAMES = {};
export function framesFor(kind) { return FRAMES[kind] || (FRAMES[kind] = makeFrames(SPECIES[kind])); }

// ---- behaviour -------------------------------------------------------------------------

export const POPULATIONS = {
  few: { clown: 2, blueTang: 1, yellowTang: 1, idol: 0, flame: 1, puffer: 1, chromis: 8 },
  normal: { clown: 3, blueTang: 2, yellowTang: 2, idol: 1, flame: 2, puffer: 1, chromis: 14 },
  lots: { clown: 3, blueTang: 3, yellowTang: 3, idol: 2, flame: 3, puffer: 1, chromis: 22 },
  crowded: { clown: 4, blueTang: 4, yellowTang: 4, idol: 3, flame: 4, puffer: 2, chromis: 32 },
};

export function createFishSchool(random) {
  const fish = [];
  const school = { tx: 0, ty: 0, retarget: 0 };
  let layout = null, tank = null, flora = null;
  let mode = 'shy';

  function spawn(kind, x, y, fromSide = 0) {
    const spec = SPECIES[kind];
    const back = kind !== 'clown' && kind !== 'puffer' && random() < 0.28;
    const f = {
      kind, spec, art: framesFor(kind),
      x: x ?? layout.W * (0.1 + random() * 0.8), y: y ?? waterY(random()),
      vx: 0, vy: 0, dir: random() < 0.5 ? -1 : 1, anim: random() * 4, turning: 0,
      tx: 0, ty: 0, retarget: 0, back, speed: spec.speed * (0.8 + random() * 0.4) * (back ? 0.75 : 1),
      state: 'swim', stateT: 0, puff: 0, puffHold: false, curiousT: 0, flash: 0, gulp: 0, fed: 0,
      home: kind === 'clown' ? { x: 0, y: 0 } : null,
      // each schooling fish keeps its own place in the formation
      slotX: (random() - 0.5) * 44, slotY: (random() - 0.5) * 22,
    };
    if (fromSide) { f.x = fromSide < 0 ? -f.art.w : layout.W + f.art.w; f.dir = fromSide < 0 ? 1 : -1; f.vx = f.dir * f.speed; }
    pickTarget(f);
    fish.push(f);
    return f;
  }

  const waterY = r => layout.surfaceY + 14 + r * (layout.floorY - layout.surfaceY - 30);

  function populate(level) {
    fish.length = 0;
    const counts = POPULATIONS[level] || POPULATIONS.normal;
    for (const [kind, n] of Object.entries(counts)) for (let k = 0; k < n; k++) spawn(kind);
    const a = flora.anemone;
    for (const f of fish) if (f.kind === 'clown' && a) { f.x = a.x + (random() - 0.5) * 20; f.y = a.y - 14 - random() * 8; }
    school.tx = layout.W * 0.5; school.ty = waterY(0.4);
  }

  function build(next, tankRef, floraRef, level) {
    const first = !layout;
    layout = next; tank = tankRef; flora = floraRef;
    if (first) populate(level);
    for (const f of fish) { f.x = clamp(f.x, 4, layout.W - 4); f.y = clamp(f.y, layout.surfaceY + 8, layout.floorY - 6); pickTarget(f); }
  }

  function pickTarget(f) {
    const { W } = layout;
    if (f.kind === 'clown' && flora?.anemone) {
      const a = flora.anemone;
      f.tx = a.x + (random() - 0.5) * 34; f.ty = a.y - 6 - random() * 22;
    } else if (f.kind === 'puffer') {
      f.tx = W * (0.15 + random() * 0.7); f.ty = waterY(0.2 + random() * 0.6);
    } else {
      f.tx = W * (0.03 + random() * 0.94); f.ty = waterY(random());
    }
    f.retarget = 3 + random() * 6;
  }

  function nearestFood(f, food) {
    let best = null, bestD = f.kind === 'chromis' ? 90 : 130;
    for (const p of food) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - f.x, p.y - f.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function update(dt, time, env) {
    const { pointer, food, currents } = env;
    school.retarget -= dt;
    if (school.retarget <= 0) { school.tx = layout.W * (0.1 + random() * 0.8); school.ty = waterY(0.1 + random() * 0.6); school.retarget = 5 + random() * 6; }
    for (const f of fish) {
      f.stateT += dt;
      f.flash = Math.max(0, f.flash - dt);
      f.gulp = Math.max(0, f.gulp - dt);
      f.turning = Math.max(0, f.turning - dt);
      f.retarget -= dt;
      if (f.retarget <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < 5) pickTarget(f);
      let speed = f.speed, tx = f.tx, ty = f.ty, accel = f.spec.accel;
      // puffer inflation
      if (f.kind === 'puffer') {
        if (f.puffHold) f.puff = Math.min(1.35, f.puff + dt * 1.6);
        else if (f.state === 'puffed' && f.stateT < 2.4) f.puff = Math.min(1, f.puff + dt * 3);
        else { f.puff = Math.max(0, f.puff - dt * 0.6); if (f.state === 'puffed' && f.puff === 0) f.state = 'swim'; }
        if (f.puff > 0.1) { speed *= 0.2; ty = f.y - 6; tx = f.x; }
      }
      if (f.state === 'flee') {
        speed *= 3.2; accel *= 3;
        if (f.stateT > 0.7) f.state = 'swim';
      }
      const meal = f.state !== 'flee' && f.puff < 0.1 ? nearestFood(f, food) : null;
      if (meal) {
        tx = meal.x; ty = meal.y; speed *= 1.7; accel *= 1.5;
        if (Math.hypot(meal.x - f.x - f.dir * 2, meal.y - f.y) < 3) { meal.alive = false; f.gulp = 0.25; f.fed++; }
      } else if (f.kind === 'chromis' && f.state !== 'flee') {
        // school: cohesion, alignment, separation, and the school's own wander target
        let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0;
        for (const o of fish) {
          if (o === f || o.kind !== 'chromis' || o.back !== f.back) continue;
          const dx = o.x - f.x, dy = o.y - f.y, d = Math.hypot(dx, dy);
          if (d > 30) continue;
          cx += o.x; cy += o.y; ax += o.vx; ay += o.vy; n++;
          // keep a body length apart, more along the vertical so the school spreads into a band
          const near = 10;
          if (d < near) { sx -= dx / (d || 1) * (near - d); sy -= dy / (d || 1) * (near - d) * 1.4; }
        }
        tx = school.tx + f.slotX; ty = school.ty + f.slotY + (f.back ? -12 : 0);
        if (n) { tx = tx * 0.55 + (cx / n + ax / n * 0.5) * 0.45 + sx * 4; ty = ty * 0.55 + (cy / n + ay / n * 0.5) * 0.45 + sy * 4; }
      }
      // the pointer: shy fish bolt from a fast cursor, curious ones come to a still one
      if (pointer.active && !f.back) {
        const dx = f.x - pointer.x, dy = f.y - pointer.y, d = Math.hypot(dx, dy);
        if (mode === 'shy' && d < 34 && pointer.speed > 60 && f.state !== 'flee') {
          startle(f, dx, dy);
        } else if (mode === 'curious' && d < 70 && d > 8 && pointer.still < 6 && !meal && f.state !== 'flee') {
          f.curiousT += dt;
          tx = pointer.x + Math.sign(dx || 1) * 10; ty = pointer.y; speed *= 0.7;
        }
      }
      if (f.state === 'flee') { tx = f.x + f.fleeX * 40; ty = f.y + f.fleeY * 40; }
      // steer
      const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1;
      const arrive = Math.min(1, d / 12);
      const k = 1 - Math.exp(-accel * dt);
      f.vx += (dx / d * speed * arrive - f.vx) * k;
      f.vy += (dy / d * speed * arrive * 0.6 - f.vy) * k;
      for (const cur of currents) {
        if (!cur.alive) continue;
        const cd = Math.hypot(f.x - cur.x, f.y - cur.y);
        if (cd < cur.r) { const w = (1 - cd / cur.r) * cur.strength; f.vx += cur.vx * w * dt * 3; f.vy += cur.vy * w * dt * 3; }
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      // stay in the water, off the sand
      const floor = Math.min(layout.floorY - 4, tank.sandAt(f.x) - 3);
      if (f.y < layout.surfaceY + 8) { f.y = layout.surfaceY + 8; f.vy = Math.abs(f.vy) * 0.3; }
      if (f.y > floor) { f.y = floor; f.vy = -Math.abs(f.vy) * 0.3; }
      if (f.x < -f.art.w) { f.x = -f.art.w; f.vx = Math.abs(f.vx); }
      if (f.x > layout.W + f.art.w) { f.x = layout.W + f.art.w; f.vx = -Math.abs(f.vx); }
      const want = f.vx > 2.5 ? 1 : f.vx < -2.5 ? -1 : f.dir;
      if (want !== f.dir) { f.dir = want; f.turning = 0.1; }
      f.anim += dt * (2 + Math.hypot(f.vx, f.vy) * 0.18);
    }
  }

  function startle(f, dx = f.x - layout.W / 2, dy = 0) {
    const d = Math.hypot(dx, dy) || 1;
    f.state = 'flee'; f.stateT = 0; f.flash = 0.3;
    f.fleeX = dx / d; f.fleeY = dy / d * 0.6;
    if (f.kind === 'clown' && flora?.anemone) { f.fleeX = (flora.anemone.x - f.x) / 40; f.fleeY = (flora.anemone.y - 8 - f.y) / 40; }
  }

  function draw(s, back, time) {
    for (const f of fish) {
      if (f.back !== back) continue;
      if (f.kind === 'puffer' && f.puff > 0.12) { drawPuffed(s, f, time); continue; }
      const step = Math.floor(f.anim) % 4;
      const img = f.art.frames[f.turning > 0 ? 4 : step];
      const x = Math.round(f.x - (f.dir > 0 ? f.art.noseX - 2 : f.art.w - f.art.noseX + 1));
      const y = Math.round(f.y - f.art.cy);
      s.blit(img, x, y, f.dir < 0, back ? FOG[0] : f.flash > 0 && Math.floor(f.flash * 20) % 2 ? palette.lighter : null);
      if (f.gulp > 0) s.pset(f.x + f.dir * 2, f.y - 2, c('foam1'));
    }
  }

  function drawPuffed(s, f, time) {
    const r = 3 + f.puff * 5;
    const cx = Math.round(f.x), cy = Math.round(f.y);
    s.disc(cx, cy, r + 1, INK);
    s.disc(cx, cy, r, c('sand4'));
    // belly and spots
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
      if (x * x + y * y > r * r) continue;
      if (y > r * 0.3) s.pset(cx + x, cy + y, c('white1'));
      else if (y < -r * 0.55) s.pset(cx + x, cy + y, c('sand5'));
      else if ((x * 7 + y * 13 + 99) % 9 === 0) s.pset(cx + x, cy + y, c('sand1'));
    }
    // spines
    const spines = Math.round(8 + r * 1.5);
    for (let k = 0; k < spines; k++) {
      const a = (k / spines) * Math.PI * 2 + 0.2;
      s.pset(cx + Math.cos(a) * (r + 1.5), cy + Math.sin(a) * (r + 1.5), c('sand2'));
      if (f.puff > 0.7) s.pset(cx + Math.cos(a) * (r + 2.5), cy + Math.sin(a) * (r + 2.5), c('sand1'));
    }
    // face
    const ex = cx + f.dir * Math.round(r * 0.45), ey = cy - Math.round(r * 0.3);
    s.pset(ex, ey, c('white2')); s.pset(ex + f.dir, ey, INK);
    s.pset(cx + f.dir * Math.round(r), cy + 1, c('sand1'));
    // little fins working hard
    const flap = Math.floor(time * 16) % 2;
    s.pset(cx - f.dir * Math.round(r + 1), cy - flap, c('sand3'));
    s.pset(cx, cy - Math.round(r) - 1 - flap, c('sand3'));
  }

  function hitTest(x, y) {
    let best = null, bestD = 9;
    for (const f of fish) {
      if (f.back) continue;
      const r = f.kind === 'puffer' && f.puff > 0.1 ? 4 + f.puff * 5 : f.spec.height / 2 + 3;
      const cx = f.x - f.dir * f.spec.len * 0.3;
      const d = Math.hypot((x - cx) / Math.max(1, f.spec.len / (f.spec.height + 2)), y - f.y);
      if (d < r + 2 && d < bestD) { best = f; bestD = d; }
    }
    return best;
  }

  return {
    fish, build, update, draw, hitTest, startle, spawn, populate,
    setMode(m) { mode = m === 'curious' ? 'curious' : 'shy'; },
    get mode() { return mode; },
    scatter(x, y, r) {
      for (const f of fish) {
        const dx = f.x - x, dy = f.y - y;
        if (Math.hypot(dx, dy) < r) startle(f, dx, dy);
      }
    },
  };
}
