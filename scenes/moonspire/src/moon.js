import { Surface, CLEAR, bayer, createNoise, clamp, easeInOut } from '../../shared/pixel-engine.js';
import { palette } from './palette.js';

const c = name => palette.c(name);
const MOON = palette.ramp('moon');
export const MOON_HP = 100;
// A freshly broken edge glows white, then magic cyan, then cools back to rock.
const EDGE = ['star4', 'cyan5', 'cyan4', 'cyan3', 'cyan2', 'cyan1'];

/**
 * The moon: a lit sphere with maria and craters that takes damage as cracks, bursts into
 * tumbling chunks cut from its own pixels, and can be put back together.
 */
export function createMoon(random) {
  const noise = createNoise(Math.floor(random() * 1e9));
  const base = new Surface(1, 1);
  const moon = {
    x: 0, y: 0, r: 16,
    state: 'intact', // intact | shattered | mending
    hp: MOON_HP,
    cracks: [],
    chunks: [],
    sinceHit: 0,
    sinceShatter: 0,
    mendProgress: 0,
    wobble: 0,
    phase: 0,
  };

  function build(x, y, r) {
    const moved = r !== moon.r || !base.data.length || base.w !== r * 2 + 3;
    moon.x = x; moon.y = y; moon.r = r;
    if (moved) render();
    if (moon.state !== 'intact') {
      // A resize mid-show: put it back rather than re-map every chunk.
      moon.state = 'intact'; moon.chunks = []; moon.hp = MOON_HP; moon.cracks = [];
    }
  }

  function render() {
    const r = moon.r, size = r * 2 + 3;
    base.resize(size, size, CLEAR);
    base.clear(CLEAR);
    const L = [0.42, -0.28, 0.86];
    // shading offsets below are in steps of a six-colour ramp; stretch them to ours
    const step = (MOON.length - 1) / 5;
    const fine = r > 22;
    const craters = [];
    for (let k = 0; k < 9 + (fine ? 6 : 0); k++) {
      const a = random() * Math.PI * 2, d = Math.sqrt(random()) * 0.8;
      craters.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: (0.07 + random() * 0.12) * (k > 8 ? 0.55 : 1) });
    }
    // one young crater throws bright rays across the face
    const ray = { x: -0.25, y: 0.42, r: 0.06 };
    const cx = r + 1, cy = r + 1;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > (r + 0.5) * (r + 0.5)) continue;
      const nx = dx / (r + 0.5), ny = dy / (r + 0.5), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lambert = nx * L[0] + ny * L[1] + nz * L[2];
      let level = clamp(0.35 + lambert * 0.75, 0, 1) * (MOON.length - 1);
      const maria = noise.fbm2(nx * 2.3 + 4, ny * 2.3 + 1, 4);
      if (maria > 0.5) level -= 1.1 * step;
      if (maria > 0.6) level -= 0.5 * step;
      for (const cr of craters) {
        const qx = nx - cr.x, qy = ny - cr.y, q = Math.hypot(qx, qy) / cr.r;
        if (q < 1) {
          level -= 0.7 * step;
          // lit inner wall faces away from the light, shaded wall faces it
          const facing = (qx * L[0] + qy * L[1]) / (Math.hypot(qx, qy) || 1);
          if (q > 0.55) level += facing > 0.2 ? 1.3 * step : facing < -0.3 ? -0.6 * step : 0;
        } else if (q < 1.25) level += 0.35 * step;
      }
      if (fine) {
        const rx = nx - ray.x, ry = ny - ray.y, rd = Math.hypot(rx, ry);
        const spoke = Math.abs(Math.sin(Math.atan2(ry, rx) * 7 + 0.6));
        if (rd < ray.r) level += 1.2 * step;
        else if (rd < 0.7 && spoke > 0.93 && noise.n2(nx * 9, ny * 9) > 0.35) level += 0.9 * step * (1 - rd / 0.7);
        // pocked highlands: tiny craterlets
        if (noise.n2(nx * 14 + 3, ny * 14) > 0.8) level -= 0.8 * step;
        // a thin bright limb on the lit side
        if (nz < 0.3 && lambert > 0.25) level += 0.6 * step;
      }
      let k = Math.floor(level);
      if (level - k > bayer(x, y)) k++;
      base.data[y * size + x] = MOON[clamp(k, 0, MOON.length - 1)];
    }
  }

  const contains = (x, y, pad = 3) => moon.state === 'intact' && Math.hypot(x - moon.x, y - moon.y) <= moon.r + pad;

  function crack(fromX, fromY, length) {
    const points = [];
    let x = fromX, y = fromY;
    let a = Math.atan2(-y, -x) + (random() - 0.5) * 1.4;
    for (let s = 0; s < length; s++) {
      a += (random() - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a);
      if (x * x + y * y > moon.r * moon.r) break;
      points.push(Math.round(x), Math.round(y));
      if (random() < 0.12 && length > 4) moon.cracks.push({ points: crackBranch(x, y, a, length * 0.4), glow: 1 });
    }
    return points;
  }
  function crackBranch(x, y, a, length) {
    const points = [];
    a += (random() < 0.5 ? -1 : 1) * (0.6 + random() * 0.6);
    for (let s = 0; s < length; s++) {
      a += (random() - 0.5) * 0.8;
      x += Math.cos(a); y += Math.sin(a);
      if (x * x + y * y > moon.r * moon.r) break;
      points.push(Math.round(x), Math.round(y));
    }
    return points;
  }

  /** A bolt lands at (x, y) in screen pixels. Returns 'crack', 'shatter' or null. */
  function hit(x, y, power) {
    if (moon.state !== 'intact') return null;
    let dx = x - moon.x, dy = y - moon.y;
    const d = Math.hypot(dx, dy);
    if (d > moon.r - 1) { dx *= (moon.r - 2) / d; dy *= (moon.r - 2) / d; }
    moon.hp -= 8 + power * 92;
    moon.sinceHit = 0;
    moon.wobble = 1;
    if (moon.hp <= 0) { shatter(dx, dy, power); return 'shatter'; }
    const n = 1 + Math.round(power * 3);
    for (let k = 0; k < n; k++) moon.cracks.push({ points: crack(dx, dy, moon.r * (0.5 + random() * 0.9)), glow: 1 });
    // At low health the old cracks join up across the face.
    if (moon.hp < 40 && moon.cracks.length < 30) moon.cracks.push({ points: crack(moon.r * (random() - 0.5) * 1.4, moon.r * (random() - 0.5) * 1.4, moon.r), glow: 0.6 });
    return 'crack';
  }

  function shatter(ix, iy, power) {
    const size = base.w, cx = moon.r + 1, cy = moon.r + 1;
    // Voronoi cells over the disc: small near the impact, larger away from it.
    const seeds = [];
    const count = 26 + Math.round(power * 14);
    for (let k = 0; k < count; k++) {
      const near = k < count * 0.4;
      const a = random() * Math.PI * 2, rr = near ? random() * moon.r * 0.5 : Math.sqrt(random()) * moon.r;
      const sx = near ? ix + Math.cos(a) * rr : Math.cos(a) * rr, sy = near ? iy + Math.sin(a) * rr : Math.sin(a) * rr;
      seeds.push({ x: sx, y: sy, pixels: [] });
    }
    const img = base.data;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let color = img[y * size + x];
      if (color === CLEAR) continue;
      const dx = x - cx, dy = y - cy;
      for (const cr of moon.cracks) for (let p = 0; p < cr.points.length; p += 2) {
        if (cr.points[p] === dx && cr.points[p + 1] === dy) color = c('moon0');
      }
      let best = 0, bestD = Infinity;
      for (let k = 0; k < seeds.length; k++) {
        const e = (dx - seeds[k].x) ** 2 + (dy - seeds[k].y) ** 2;
        if (e < bestD) { bestD = e; best = k; }
      }
      seeds[best].pixels.push(dx, dy, color);
    }
    moon.chunks = [];
    for (const seed of seeds) {
      const px = seed.pixels;
      if (!px.length) continue;
      let mx = 0, my = 0;
      for (let p = 0; p < px.length; p += 3) { mx += px[p]; my += px[p + 1]; }
      const n = px.length / 3;
      mx /= n; my /= n;
      const offsets = new Int8Array(n * 2), colors = new Uint8Array(n);
      for (let p = 0, q = 0; p < px.length; p += 3, q++) {
        offsets[q * 2] = Math.round(px[p] - mx); offsets[q * 2 + 1] = Math.round(px[p + 1] - my);
        colors[q] = px[p + 2];
      }
      // Away from the impact and from the centre, faster for small pieces and big blasts.
      let ax = mx - ix * 0.6, ay = my - iy * 0.6;
      const al = Math.hypot(ax, ay) || 1;
      ax /= al; ay /= al;
      const speed = (18 + random() * 38) * (0.7 + power * 0.8) * (n < 12 ? 1.4 : 1);
      // The piece as a small bitmap, so it can be turned by sampling backwards (no holes),
      // plus a mask of its broken edge, which is what glows.
      let x0 = 0, x1 = 0, y0 = 0, y1 = 0, reach = 0;
      for (let q = 0; q < n; q++) {
        const ox = offsets[q * 2], oy = offsets[q * 2 + 1];
        x0 = Math.min(x0, ox); x1 = Math.max(x1, ox); y0 = Math.min(y0, oy); y1 = Math.max(y1, oy);
        reach = Math.max(reach, Math.hypot(ox, oy));
      }
      const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
      const grid = new Uint8Array(gw * gh).fill(CLEAR), edge = new Uint8Array(gw * gh);
      for (let q = 0; q < n; q++) grid[(offsets[q * 2 + 1] - y0) * gw + offsets[q * 2] - x0] = colors[q];
      for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
        if (grid[gy * gw + gx] === CLEAR) continue;
        const open = (dx, dy) => { const X = gx + dx, Y = gy + dy; return X < 0 || Y < 0 || X >= gw || Y >= gh || grid[Y * gw + X] === CLEAR; };
        if (open(-1, 0) || open(1, 0) || open(0, -1) || open(0, 1)) edge[gy * gw + gx] = 1;
      }
      moon.chunks.push({
        hx: mx, hy: my, x: moon.x + mx, y: moon.y + my,
        vx: ax * speed + (random() - 0.5) * 10, vy: ay * speed + (random() - 0.5) * 10 - 6,
        angle: 0, spin: (random() - 0.5) * 3.5, offsets, colors, heat: 1,
        grid, edge, gw, gh, gx0: x0, gy0: y0, reach: Math.ceil(reach) + 1,
        startX: 0, startY: 0, startAngle: 0, delay: 0,
      });
    }
    moon.cracks = [];
    moon.state = 'shattered';
    moon.sinceShatter = 0;
  }

  function mend() {
    if (moon.state !== 'shattered') return false;
    moon.state = 'mending';
    moon.mendProgress = 0;
    for (const ch of moon.chunks) {
      ch.startX = ch.x; ch.startY = ch.y; ch.startAngle = ch.angle;
      // outer pieces first, so the moon closes like a shell
      ch.delay = (1 - Math.hypot(ch.hx, ch.hy) / moon.r) * 1.2 + random() * 0.5;
      ch.curl = (random() < 0.5 ? -1 : 1) * (10 + random() * 20);
    }
    return true;
  }

  function update(dt) {
    moon.sinceHit += dt;
    moon.wobble = Math.max(0, moon.wobble - dt * 3);
    for (const cr of moon.cracks) cr.glow = Math.max(0, cr.glow - dt * 0.7);
    if (moon.state === 'intact') {
      // Left alone, the moon slowly seals its cracks.
      if (moon.sinceHit > 14 && moon.cracks.length) {
        moon.sinceHit = 11;
        moon.cracks.shift();
        moon.hp = Math.min(MOON_HP, moon.hp + 12);
      }
      if (!moon.cracks.length && moon.sinceHit > 14) moon.hp = MOON_HP;
    } else if (moon.state === 'shattered') {
      moon.sinceShatter += dt;
      for (const ch of moon.chunks) {
        const drag = Math.exp(-dt * 0.55);
        ch.vx *= drag; ch.vy = ch.vy * drag + 2.5 * dt;
        ch.x += ch.vx * dt; ch.y += ch.vy * dt;
        ch.angle += ch.spin * dt;
        ch.spin *= Math.exp(-dt * 0.2);
        ch.heat = Math.max(0, ch.heat - dt * 0.42);
      }
    } else if (moon.state === 'mending') {
      moon.mendProgress += dt;
      let done = true;
      for (const ch of moon.chunks) {
        const t = clamp((moon.mendProgress - ch.delay) / 1.6, 0, 1);
        if (t < 1) done = false;
        const e = easeInOut(t);
        const tx = moon.x + ch.hx, ty = moon.y + ch.hy;
        const side = Math.sin(e * Math.PI) * ch.curl;
        const dx = tx - ch.startX, dy = ty - ch.startY, len = Math.hypot(dx, dy) || 1;
        ch.x = ch.startX + dx * e + (-dy / len) * side;
        ch.y = ch.startY + dy * e + (dx / len) * side;
        ch.angle = ch.startAngle * (1 - e);
        ch.heat = t > 0 && t < 1 ? 0.6 : 0;
      }
      if (done) {
        moon.state = 'intact';
        moon.hp = MOON_HP;
        moon.chunks = [];
        moon.sinceHit = 0;
        return 'mended';
      }
    }
    return null;
  }

  function draw(surface, time) {
    if (moon.state === 'intact') {
      const jig = moon.wobble > 0.3 ? Math.round(Math.sin(time * 60) * moon.wobble) : 0;
      const ox = Math.round(moon.x) - moon.r - 1 + jig, oy = Math.round(moon.y) - moon.r - 1;
      surface.blit(base, ox, oy);
      const mx = Math.round(moon.x) + jig, my = Math.round(moon.y);
      for (const cr of moon.cracks) {
        const pts = cr.points;
        const glow = cr.glow;
        for (let p = 0; p < pts.length; p += 2) {
          const x = mx + pts[p], y = my + pts[p + 1];
          surface.pset(x, y, glow > 0.55 ? c('cyan5') : glow > 0.25 ? c('cyan3') : c('moon0'));
          if (moon.r > 22 && glow <= 0.25) surface.pset(x - 1, y, c('moon1'));
          // lit lip on the lower-right edge of each crack
          if (glow < 0.25) surface.pmap(x + 1, y + 1, palette.lighter);
        }
      }
      return;
    }
    const edgeColors = EDGE.map(c);
    for (const ch of moon.chunks) {
      // rotation snaps to 32nds of a half turn so the pieces tumble in readable steps
      const a = Math.round(ch.angle / (Math.PI / 32)) * (Math.PI / 32);
      const cos = Math.cos(a), sin = Math.sin(a);
      const ox = Math.round(ch.x), oy = Math.round(ch.y), R = ch.reach, { grid, edge, gw, gh, gx0, gy0 } = ch;
      const heat = ch.heat;
      const hot = heat > 0.05 ? edgeColors[Math.min(edgeColors.length - 1, Math.floor((1 - heat) * edgeColors.length))] : -1;
      // sample the piece at a screen offset (turning backwards), -1 outside it
      const at = (x, y) => {
        const gx = Math.round(x * cos + y * sin) - gx0, gy = Math.round(y * cos - x * sin) - gy0;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return -1;
        const i = gy * gw + gx;
        return grid[i] === CLEAR ? -1 : i;
      };
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const i = at(dx, dy);
        if (i < 0) continue;
        let color = grid[i];
        if (hot >= 0 && edge[i]) color = hot;
        else {
          // bevel: lit toward the upper right, shaded toward the lower left, whichever way it has turned
          if (at(dx + 1, dy - 1) < 0) color = palette.lighter[color];
          else if (at(dx - 1, dy + 1) < 0) color = palette.darker[palette.darker[color]];
          else if (at(dx - 2, dy + 2) < 0 && bayer(dx, dy) < 0.6) color = palette.darker[color];
          if (heat > 0.85) color = palette.lighter[color];
        }
        surface.pset(ox + dx, oy + dy, color);
      }
    }
  }

  return { moon, build, contains, hit, shatter, mend, update, draw };
}
