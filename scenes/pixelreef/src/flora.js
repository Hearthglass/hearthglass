import { Surface, CLEAR, bayer, createNoise, clamp } from '../../shared/pixel-engine.js';
import { palette, LIGHT } from './palette.js';

const c = name => palette.c(name);

// ---- coral sprites, generated once per layout ------------------------------------------

function staghorn(random, w, h, ramp) {
  const s = new Surface(w, h, CLEAR);
  const [dark, mid, light, tip] = ramp.map(c);
  const branch = (x, y, a, len, depth) => {
    for (let k = 0; k < len; k++) {
      x += Math.sin(a); y -= Math.cos(a);
      a += (random() - 0.5) * 0.18;
      const thick = depth < 2;
      s.pset(x, y, k > len - 2 && depth >= 2 ? tip : mid);
      if (thick) { s.pset(x + 1, y, light); s.pset(x - 1, y, dark); }
      else s.pset(x + (Math.sin(a) > 0 ? -1 : 1) * 0, y, mid);
    }
    s.pset(x, y, tip);
    if (depth < 3 && len > 3) {
      const spread = 0.35 + random() * 0.35;
      branch(x, y, a - spread, len * (0.62 + random() * 0.2), depth + 1);
      branch(x, y, a + spread, len * (0.62 + random() * 0.2), depth + 1);
      if (random() < 0.3) branch(x, y, a + (random() - 0.5) * 0.3, len * 0.5, depth + 2);
    }
  };
  for (let k = 0; k < 3; k++) branch(w / 2 + (k - 1) * 3, h - 1, (k - 1) * 0.45 + (random() - 0.5) * 0.2, h * 0.28, 0);
  s.outline(dark === c('pink1') ? c('pink0') : c('purple0'));
  return s;
}

function brain(random, rx, ry, ramp) {
  const w = rx * 2 + 3, h = ry + 3;
  const s = new Surface(w, h, CLEAR);
  const [d0, d1, d2, d3, d4] = ramp.map(c);
  const cx = rx + 1, by = h - 1;
  const seed = random() * 10;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x - cx) / (rx + 0.5), ny = (by - y) / (ry + 0.5);
    if (ny < 0 || nx * nx + ny * ny > 1) continue;
    const maze = Math.sin(x * 0.95 + Math.sin(y * 0.8 + seed) * 2.2) * Math.sin(y * 1.05 + Math.sin(x * 0.6 + seed) * 2);
    const lightK = ny * 0.6 - nx * 0.25 + 0.4;
    let color = lightK > 0.65 ? d3 : lightK > 0.35 ? d2 : d1;
    if (Math.abs(maze) < 0.22) color = d1 === color ? d0 : palette.darker[color];
    if (lightK > 0.8 && maze > 0.5 && bayer(x, y) > 0.5) color = d4;
    s.data[y * w + x] = color;
  }
  s.outline(d0);
  return s;
}

function seaFan(random, w, h, ramp) {
  const s = new Surface(w, h, CLEAR);
  const [d0, d1, d2, d3, tip] = ramp.map(c);
  const bx = w / 2, by = h - 1, R = h - 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - bx, dy = by - y;
    const r = Math.hypot(dx, dy), a = Math.atan2(dx, dy);
    if (r > R || Math.abs(a) > 1.15 || dy < 0) continue;
    const edge = R - r < 1.5 || Math.abs(Math.abs(a) - 1.15) < 0.05;
    const spoke = Math.abs(((a + 1.2) * r * 0.55) % 3) < 0.9;
    const arc = Math.abs((r + Math.sin(a * 5) * 1.2) % 4) < 0.8;
    if (!(edge || spoke || arc) || (random() < 0.08 && !edge)) continue;
    let color = r > R * 0.8 ? d3 : r > R * 0.45 ? d2 : d1;
    if (edge && r > R * 0.7) color = tip;
    s.pset(x, y, color);
  }
  // trunk
  s.line(bx, by, bx, by - 4, d0);
  s.line(bx + 1, by, bx + 1, by - 3, d1);
  return s;
}

function tubes(random, ramp) {
  const heights = [9 + Math.floor(random() * 5), 13 + Math.floor(random() * 5), 7 + Math.floor(random() * 4), 11];
  const w = 18, h = Math.max(...heights) + 3;
  const s = new Surface(w, h, CLEAR);
  const [d0, d1, d2, d3, d4] = ramp.map(c);
  heights.forEach((th, k) => {
    const x0 = 1 + k * 4, top = h - th;
    for (let y = top; y < h; y++) {
      const flare = y < top + 2 ? 1 : 0;
      for (let x = x0 - flare; x < x0 + 3 + flare; x++) {
        const u = (x - x0 + flare) / (2 + flare * 2);
        s.pset(x, y, u < 0.25 ? d1 : u > 0.75 ? d3 : d2);
      }
    }
    s.hline(x0, x0 + 2, top, d0);
    s.pset(x0 + 1, top + 1, c('ink0'));
    s.pset(x0 - 1, top, d4); s.pset(x0 + 3, top, d3);
  });
  s.outline(d0);
  return s;
}

function mushroom(random, ramp) {
  const w = 15, h = 11;
  const s = new Surface(w, h, CLEAR);
  const [d0, d1, d2, d3, d4] = ramp.map(c);
  s.rect(6, 5, 3, 6, d2);
  s.vline(6, 5, 10, d1);
  for (let x = 0; x < w; x++) {
    const u = (x - 7) / 7.5;
    const top = Math.round(4 - Math.sqrt(Math.max(0, 1 - u * u)) * 3.5 + Math.sin(x * 1.4) * 0.6);
    for (let y = top; y <= 5; y++) {
      let color = y === top ? d4 : y === 5 ? d1 : d3;
      if ((x % 3 === 0) && y > top) color = d2;
      if (Math.abs(u) < 1) s.pset(x, y, color);
    }
  }
  s.outline(d0);
  return s;
}

export function createFlora(random) {
  const noise = createNoise(Math.floor(random() * 1e9));
  let kelp = [], grass = [], statics = [], fans = [], polyps = [], anemone = null, mushrooms = [];
  let layout = null;

  function build(next, tank) {
    layout = next;
    const { W, H, floorY } = layout;
    const [left, right, mid] = tank.rocks;
    const topOf = (rock, u) => {
      const x = Math.round(rock.x0 + (rock.x1 - rock.x0) * u);
      let y = rock.surfaceAt(x);
      for (let k = -2; k <= 2 && y < 0; k++) y = rock.surfaceAt(x + k);
      return { x, y: y < 0 ? floorY : y };
    };
    statics = [];
    fans = [];
    polyps = [];
    mushrooms = [];
    // Left formation: a sea fan behind, staghorn and brain coral on top.
    const fanAt = topOf(left, 0.35);
    fans.push({ sprite: seaFan(random, 23, 22, ['purple1', 'purple2', 'purple3', 'purple4', 'pink4']), x: fanAt.x - 11, y: fanAt.y - 20, phase: random() * 6 });
    const stagAt = topOf(left, 0.62);
    statics.push({ sprite: staghorn(random, 26, 22, ['pink1', 'pink3', 'pink4', 'pink5']), x: stagAt.x - 13, y: stagAt.y - 19 });
    const brainAt = topOf(left, 0.5);
    statics.push({ sprite: brain(random, 8, 6, ['green1', 'green2', 'green3', 'green4', 'green5']), x: brainAt.x - 9, y: brainAt.y - 7 });
    const brain2At = topOf(left, 0.8);
    statics.push({ sprite: brain(random, 5, 4, ['sand1', 'sand2', 'sand3', 'sand4', 'sand5']), x: brain2At.x - 6, y: brain2At.y - 4 });
    // Right formation: tube sponges, a leather coral, a purple staghorn.
    const tubeAt = topOf(right, 0.42);
    statics.push({ sprite: tubes(random, ['orange0', 'orange1', 'orange2', 'orange3', 'orange4']), x: tubeAt.x - 9, y: tubeAt.y - 15 });
    const mushAt = topOf(right, 0.66);
    mushrooms.push({ sprite: mushroom(random, ['teal0', 'teal1', 'teal2', 'teal3', 'teal4']), x: mushAt.x - 7, y: mushAt.y - 9, phase: random() * 6 });
    const stag2At = topOf(right, 0.2);
    statics.push({ sprite: staghorn(random, 20, 16, ['purple1', 'purple3', 'purple4', 'purple5']), x: stag2At.x - 10, y: stag2At.y - 14 });
    const fan2At = topOf(right, 0.85);
    fans.push({ sprite: seaFan(random, 17, 16, ['red0', 'red1', 'red2', 'red3', 'orange4']), x: fan2At.x - 8, y: fan2At.y - 14, phase: random() * 6 });
    // Zoanthid polyps scattered on rock faces; they glow at night.
    for (const rock of [left, right, mid]) {
      for (let k = 0; k < 7; k++) {
        const p = topOf(rock, 0.1 + random() * 0.8);
        const x = p.x + Math.round((random() - 0.5) * 4), y = p.y + 2 + Math.floor(random() * 5);
        polyps.push({ x, y, color: random() < 0.5 ? 'green' : 'orange', phase: random() * 6 });
      }
    }
    // The anemone lives on the small middle rock.
    const anemAt = topOf(mid, 0.5);
    anemone = { x: anemAt.x, y: anemAt.y + 1, retract: 0, phase: random() * 6, tentacles: [] };
    // Back row first (darker, shorter), then the front row over it.
    for (const row of [0, 1]) {
      const n = row ? 15 : 12;
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1) - 0.5;
        anemone.tentacles.push({ row, base: u * (row ? 10 : 8), angle: u * (row ? 2.5 : 2.1), len: (row ? 9 : 7) + random() * 4 - Math.abs(u) * 3, phase: random() * 6 });
      }
    }
    // Kelp: tall and swaying, some far (fogged) and some near.
    kelp = [];
    const kelpSpots = [[W * 0.04, true], [W * 0.2, true], [W * 0.66, true], [W * 0.95, false], [W * 0.27, false], [W * 0.6, false]];
    for (const [x, far] of kelpSpots) {
      const base = tank.sandAt(x) + 2;
      const height = (base - layout.surfaceY) * (far ? 0.75 + random() * 0.2 : 0.45 + random() * 0.3);
      kelp.push({ x: Math.round(x), base, height, far, phase: random() * 6, leaves: 5 + Math.floor(height / 7), seed: random() * 100 });
    }
    // Seagrass tufts on open sand.
    grass = [];
    for (let x = 4; x < W; x += 5 + Math.floor(random() * 11)) {
      const onRock = tank.rocks.some(r => x > r.x0 + 4 && x < r.x1 - 4 && r.surfaceAt(x) > 0 && r.surfaceAt(x) < floorY - 4);
      if (onRock || random() < 0.35) continue;
      const blades = [];
      for (let k = 0; k < 3 + Math.floor(random() * 4); k++) blades.push({ dx: k - 2 + Math.round(random()), len: 4 + Math.floor(random() * 8), lean: (random() - 0.5) * 0.8, phase: random() * 6 });
      grass.push({ x, y: tank.sandAt(x) + 1, blades });
    }
  }

  function drawKelp(s, time, far, current = 0) {
    for (const k of kelp) {
      if (k.far !== far) continue;
      // far kelp is a water-tinted silhouette; near kelp is full colour
      const stalk = far ? c('water4') : c('green2');
      const leafA = far ? c('water4') : c('green3');
      const leafB = far ? c('water5') : c('green4');
      const hi = far ? c('water6') : c('green5');
      let px = k.x, py = k.base;
      const segs = Math.round(k.height / 2);
      const points = [];
      for (let n = 0; n <= segs; n++) {
        const f = n / segs;
        const sway = (Math.sin(time * 0.7 + k.phase + f * 2.4) * 5 + Math.sin(time * 1.3 + k.phase * 2 + f * 4) * 1.5 + current * 12) * Math.pow(f, 1.3);
        const x = k.x + sway, y = k.base - n * 2;
        if (n) s.line(px, py, x, y, stalk);
        points.push(x, y);
        px = x; py = y;
      }
      // blades alternate sides, each with a gas bladder at its base
      for (let n = 2; n < segs; n += Math.max(2, Math.round(segs / k.leaves))) {
        const side = n % 4 < 2 ? 1 : -1;
        const x = points[n * 2], y = points[n * 2 + 1];
        const f = n / segs;
        const flutter = Math.sin(time * 2 + n + k.phase) * 0.35;
        const len = 5 + Math.round(noise.n1(k.seed + n) * 4);
        let bx = x, by = y;
        for (let m = 1; m <= len; m++) {
          const a = side * (0.9 - m * 0.08) + flutter * (m / len);
          const nx = x + Math.sin(a) * m * 0.9 * side * side, ny = y - m * 0.55 - Math.abs(Math.cos(a)) * m * 0.3;
          s.pset(nx, ny, m === len ? hi : leafB);
          s.pset(nx, ny + 1, leafA);
          bx = nx; by = ny;
        }
        if (!far && f < 0.9) s.pset(x + side, y, c('yellow1'));
      }
    }
  }

  function drawCorals(s, time, night) {
    for (const f of fans) {
      const rows = f.sprite.h;
      const offsets = f.offsets || (f.offsets = new Float32Array(rows));
      for (let r = 0; r < rows; r++) offsets[r] = Math.round(Math.sin(time * 0.9 + f.phase) * (1 - r / rows) * 1.6);
      s.blitRows(f.sprite, f.x, f.y, offsets);
    }
    for (const st of statics) s.blit(st.sprite, st.x, st.y);
    for (const m of mushrooms) {
      const offsets = m.offsets || (m.offsets = new Float32Array(m.sprite.h));
      for (let r = 0; r < m.sprite.h; r++) offsets[r] = r < 6 ? Math.round(Math.sin(time * 1.1 + m.phase) * 0.8) : 0;
      s.blitRows(m.sprite, m.x, m.y, offsets);
    }
    for (const p of polyps) {
      const open = Math.sin(time * 0.6 + p.phase) > -0.6;
      const [a, b] = p.color === 'green' ? [c('green5'), c('green3')] : [c('orange4'), c('orange2')];
      s.pset(p.x, p.y, open ? a : b);
      s.pset(p.x + 1, p.y, b);
      if (open) s.pset(p.x, p.y - 1, b);
    }
  }

  function drawPolypGlow(s, time) {
    for (const p of polyps) {
      if (p.color !== 'green') continue;
      s.glow(p.x, p.y, 4, LIGHT.bio, 0.5 + Math.sin(time * 1.3 + p.phase) * 0.2);
      s.pset(p.x, p.y, c('glow1'));
    }
  }

  function drawGrass(s, time, current = 0) {
    for (const g of grass) for (const b of g.blades) {
      const color = b.len > 8 ? c('green3') : c('green4');
      for (let m = 0; m < b.len; m++) {
        const f = m / b.len;
        const sway = (Math.sin(time * 1.2 + b.phase + g.x * 0.1) * 1.6 + b.lean * 3 + current * 6) * f * f;
        s.pset(g.x + b.dx + sway, g.y - m, m === b.len - 1 ? c('green5') : f < 0.3 ? c('green2') : color);
      }
    }
  }

  function drawAnemone(s, time, current = 0) {
    const a = anemone;
    if (!a) return;
    // column
    for (let dy = 0; dy < 4; dy++) {
      const half = 5 - Math.floor(dy * 0.4);
      for (let dx = -half; dx <= half; dx++) {
        const u = (dx + half) / (half * 2);
        s.pset(a.x + dx, a.y - dy, u < 0.25 ? c('orange1') : u > 0.7 ? c('orange3') : c('orange2'));
      }
    }
    const retract = Math.min(1, a.retract);
    const reach = 1 - retract * 0.75;
    for (const t of a.tentacles) {
      let x = a.x + t.base * (1 - retract * 0.5), y = a.y - 4;
      let ang = t.angle * (1 - retract * 0.6) + Math.sin(time * 1.5 + t.phase) * 0.28 + current * 0.8;
      const len = Math.max(2, Math.round(t.len * reach));
      const back = t.row === 0;
      for (let m = 0; m < len; m++) {
        ang += Math.sin(time * 1.9 + t.phase + m * 0.5) * 0.06 + (ang > 0 ? 0.035 : -0.035);
        x += Math.sin(ang); y -= Math.cos(ang) * 0.95;
        const f = m / len;
        let color = f < 0.35 ? c('purple2') : f < 0.7 ? c('purple3') : c('pink4');
        if (back) color = palette.darker[color];
        s.pset(x, y, color);
        // thick at the root, thinning toward the tip
        if (f < 0.5) s.pset(x + (ang > 0 ? -1 : 1), y, back ? c('purple1') : c('purple2'));
      }
      // bulb tip
      s.pset(x, y, back ? c('pink4') : c('pink5'));
      s.pset(x + Math.sign(Math.sin(ang)), y, back ? c('pink3') : c('pink4'));
    }
  }

  function update(dt) {
    if (anemone) anemone.retract = Math.max(0, anemone.retract - dt * 0.5);
  }

  return {
    build, update, drawKelp, drawCorals, drawGrass, drawAnemone, drawPolypGlow,
    get anemone() { return anemone; },
    touchAnemone(x, y) {
      if (!anemone || Math.abs(x - anemone.x) > 11 || y < anemone.y - 16 || y > anemone.y + 2) return false;
      anemone.retract = 1.2;
      return true;
    },
    containsAnemone(x, y) { return anemone && Math.abs(x - anemone.x) < 11 && y > anemone.y - 16 && y < anemone.y + 2; },
  };
}
