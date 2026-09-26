import { Surface, CLEAR, bayer, createNoise, clamp } from '../../shared/pixel-engine.js';
import { palette, LIGHT, FOG } from './palette.js';

const c = name => palette.c(name);
const WATER = palette.ramp('water');

/**
 * The tank itself: water column, surface, distant reef, sand and rock. Static parts are
 * baked into layers when the size changes; light (caustics, rays, surface shimmer) is
 * drawn live on top.
 */
export function createTank(random) {
  const noise = createNoise(Math.floor(random() * 1e9));
  const back = new Surface(1, 1);   // water and the far reef
  const front = new Surface(1, 1);  // rock and sand, CLEAR elsewhere
  const lit = new Surface(1, 1);    // 1 where caustics may fall (sand and rock tops)
  let layout = null;
  let sandTop = new Int16Array(1);
  let rocks = [];
  let shells = [];
  const rays = [];

  function build(next) {
    layout = next;
    const { W, H } = layout;
    back.resize(W, H); front.resize(W, H); lit.resize(W, H);
    front.clear(CLEAR); lit.clear(0);
    sandTop = new Int16Array(W);
    buildWater(W, H);
    buildFarReef(W, H);
    buildSand(W, H);
    buildRocks(W, H);
    rays.length = 0;
    const n = Math.max(3, Math.round(W / 70));
    for (let k = 0; k < n; k++) rays.push({ x: (k + 0.3 + random() * 0.4) * W / n, width: 6 + random() * 12, slant: 0.25 + random() * 0.15, phase: random() * 10, speed: 0.1 + random() * 0.2 });
  }

  function buildWater(W, H) {
    const top = layout.surfaceY, bottom = layout.floorY;
    const d = back.data;
    for (let y = 0; y < H; y++) {
      const t = clamp((y - top) / (bottom - top), 0, 1);
      const p = (1 - Math.pow(t, 0.8)) * (WATER.length - 2) + 1;
      for (let x = 0; x < W; x++) {
        const q = clamp(p + (noise.n2(x * 0.02, y * 0.05) - 0.5) * 0.8, 0, WATER.length - 1);
        let k = Math.floor(q);
        if (q - k > bayer(x, y)) k = Math.min(WATER.length - 1, k + 1);
        d[y * W + x] = WATER[k];
      }
    }
  }

  function buildFarReef(W, H) {
    // Two fogged silhouettes of reef behind the scene, farthest palest.
    const d = back.data;
    for (let layer = 0; layer < 2; layer++) {
      const base = layout.floorY - 4 + layer * 3;
      const amp = H * (layer ? 0.16 : 0.24);
      for (let x = 0; x < W; x++) {
        const bumps = noise.fbm1(x * (layer ? 0.035 : 0.022) + layer * 50, 4);
        const spires = Math.max(0, noise.n1(x * 0.3 + layer * 9) - 0.6) * 18;
        const top = Math.round(base - amp * clamp((bumps - 0.3) * 1.8, 0, 1) - spires * (bumps > 0.45 ? 1 : 0));
        for (let y = Math.max(0, top); y < H; y++) {
          const i = y * W + x;
          const edge = y - top < 1;
          d[i] = layer === 0 ? (edge ? c('water5') : bayer(x, y) > 0.5 ? c('water4') : c('water5')) : (edge ? c('water4') : c('water3'));
        }
      }
    }
  }

  function buildSand(W, H) {
    const d = front.data;
    for (let x = 0; x < W; x++) {
      sandTop[x] = Math.round(layout.floorY + (noise.fbm1(x * 0.02 + 5, 3) - 0.5) * 10 + Math.sin(x * 0.05) * 1.5);
    }
    for (let x = 0; x < W; x++) {
      for (let y = sandTop[x]; y < H; y++) {
        const depth = y - sandTop[x];
        // Long, wavy ripples: a lit crest with a shadow on its lee side, broken up by noise
        // so they come and go across the floor instead of ruling it like lined paper.
        const phase = y * 0.9 + Math.sin(x * 0.07 + noise.n1(y * 0.3) * 3) * 2.2 + noise.n2(x * 0.03, y * 0.05) * 3;
        const ripple = Math.sin(phase);
        const present = noise.n2(x * 0.06 + 20, y * 0.15) > 0.38;
        let color = c('sand3');
        const shade = noise.n2(x * 0.05, y * 0.09);
        if (shade < 0.3 && bayer(x, y) > 0.35) color = c('sand2');
        else if (shade > 0.72 && bayer(x, y) > 0.5) color = c('sand4');
        if (present && ripple > 0.9) color = c('sand4');
        else if (present && ripple < -0.93) color = c('sand2');
        if (depth === 0) color = c('sand5');
        else if (depth === 1 && bayer(x, y) > 0.4) color = c('sand4');
        if (bayer(x * 7, y * 3) > 0.97 && noise.n2(x * 0.5, y * 0.5) > 0.6) color = c('sand6');
        if (bayer(x * 5 + 1, y * 11) > 0.975) color = c('sand1');
        // the bottom edge of the screen falls toward shadow
        const fall = (y - layout.floorY) / Math.max(1, H - layout.floorY);
        if (fall > 0.55 + bayer(x, y) * 0.45) color = palette.darker[color];
        d[y * W + x] = color;
        if (depth < 6) lit.data[y * W + x] = 1;
      }
    }
    // pebbles and shells
    shells = [];
    const count = Math.round(W / 14);
    for (let k = 0; k < count; k++) {
      const x = Math.floor(random() * W), y = sandTop[x] + 2 + Math.floor(random() * (H - sandTop[x] - 4));
      const kind = random();
      if (kind < 0.6) {
        const col = [c('rock3'), c('rock2'), c('sand1'), c('rock4')][Math.floor(random() * 4)];
        front.pset(x, y, col); front.pset(x + 1, y, col); front.pset(x, y + 1, palette.darker[col]); front.pset(x + 1, y + 1, palette.darker[col]);
        front.pset(x, y, palette.lighter[col]);
      } else shells.push({ x, y, kind: kind < 0.85 ? 'scallop' : 'spiral' });
    }
    for (const s of shells) drawShell(s);
  }

  function drawShell({ x, y, kind }) {
    if (kind === 'scallop') {
      const rows = ['.wpw.', 'wpwpw', 'pwpwp', '.ppp.'];
      rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
        if (ch === '.') return;
        front.pset(x + dx, y + dy, ch === 'w' ? c('pink5') : c('pink3'));
      }));
    } else {
      const rows = ['..ww', '.wyw', 'wyyw', 'wwy.'];
      rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
        if (ch === '.') return;
        front.pset(x + dx, y + dy, ch === 'w' ? c('sand6') : c('orange3'));
      }));
    }
  }

  // A rock formation: stacked noisy blobs, lit from above, pitted, darker at the base.
  function rockFormation(cx, baseY, width, height, seed) {
    const blobs = [];
    const n = 3 + Math.floor(width / 18);
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      const rx = width * (0.2 + random() * 0.18), ry = height * (0.35 + random() * 0.45) * Math.sin(Math.PI * (0.15 + u * 0.7));
      blobs.push({ x: cx - width / 2 + u * width + (random() - 0.5) * 8, y: baseY - ry * 0.55, rx, ry });
    }
    blobs.push({ x: cx, y: baseY - height * 0.5, rx: width * 0.28, ry: height * 0.5 });
    const x0 = Math.max(0, Math.floor(cx - width)), x1 = Math.min(layout.W - 1, Math.ceil(cx + width));
    const y0 = Math.max(0, Math.floor(baseY - height * 1.3)), y1 = Math.min(layout.H - 1, baseY + 4);
    const inside = (x, y) => {
      for (const b of blobs) {
        const dx = (x - b.x) / b.rx, dy = (y - b.y) / b.ry;
        const wobble = (noise.n2(x * 0.15 + seed, y * 0.15) - 0.5) * 0.35;
        if (dx * dx + dy * dy < 1 + wobble) return true;
      }
      return false;
    };
    const mask = new Uint8Array((x1 - x0 + 1) * (y1 - y0 + 1));
    const mw = x1 - x0 + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (y <= baseY + 3 && inside(x, y)) mask[(y - y0) * mw + x - x0] = 1;
    const m = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && mask[(y - y0) * mw + x - x0] === 1;
    const top = new Int16Array(mw).fill(-1);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (m(x, y)) { top[x - x0] = y; break; }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!m(x, y)) continue;
      // Buried below the sand line: the sand shows instead.
      if (y >= sandTop[x]) continue;
      // Depth from the top of this column: light falls from above, so anything under an
      // overhang is as dark as its depth says, even if there's a gap just above it.
      const d = Math.min(18, y - top[x - x0]);
      const rightOpen = !m(x + 1, y) || !m(x + 2, y - 1), leftOpen = !m(x - 1, y);
      // top-lit gradient, dithered between steps
      const shade = 4.6 - d * 0.2 - (leftOpen ? 1 : 0) + (rightOpen ? 0.6 : 0) + (noise.n2(x * 0.12 + seed, y * 0.12) - 0.5) * 1.2;
      let k = Math.floor(shade);
      if (shade - k > bayer(x, y)) k++;
      let color = c(`rock${clamp(k, 1, 5)}`);
      // porous live rock: small pits, each with a lit lower lip
      const pore = noise.n2(x * 0.55 + seed * 3, y * 0.55);
      if (pore < 0.16 && d > 1) color = c('rock0');
      else if (pore < 0.22 && d > 1 && noise.n2(x * 0.55 + seed * 3, (y - 1) * 0.55) < 0.16) color = palette.lighter[color];
      const nearBase = baseY - y;
      if (nearBase < 5 && bayer(x, y) > nearBase / 5) color = palette.darker[color];
      // coralline algae crust (pink and violet) on the upper faces, the odd sponge lower down
      const crust = noise.n2(x * 0.3 + 77, y * 0.3 + seed);
      if (d < 4 && crust > 0.62) color = crust > 0.72 ? c('pink3') : bayer(x, y) > 0.5 ? c('purple3') : c('pink2');
      const sponge = noise.n2(x * 0.14 + 13, y * 0.14 + seed * 2);
      if (d > 5 && sponge < 0.1 && nearBase > 4) color = bayer(x, y) > 0.35 ? c('orange2') : c('orange1');
      front.pset(x, y, color);
      if (d < 5) lit.data[y * layout.W + x] = 1;
    }
    const rock = { x0, x1, y0, baseY, top: Array.from(top), cx, width, height };
    rock.surfaceAt = x => (x >= x0 && x <= x1 && top[x - x0] >= 0 ? top[x - x0] : -1);
    return rock;
  }

  function buildRocks(W, H) {
    rocks = [];
    const f = layout.floorY;
    const left = rockFormation(W * 0.12, f + 2, Math.max(50, W * 0.26), H * 0.3, 1);
    const right = rockFormation(W * 0.86, f + 2, Math.max(52, W * 0.28), H * 0.34, 2);
    const mid = rockFormation(W * 0.37, f + 3, Math.max(22, W * 0.09), H * 0.1, 3);
    rocks.push(left, right, mid);
    // the octopus cave: a dark arch in the right formation
    const cave = { x: Math.round(W * 0.82), y: f - Math.round(H * 0.08), rx: 7, ry: 5 };
    for (let y = -cave.ry - 1; y <= cave.ry; y++) for (let x = -cave.rx - 1; x <= cave.rx + 1; x++) {
      const e = (x / (cave.rx + 0.5)) ** 2 + (y / (cave.ry + 0.5)) ** 2;
      if (y > cave.ry - 1 && e < 1.2) continue;
      const px = cave.x + x, py = cave.y + y;
      if (e < 0.55) front.pset(px, py, c('ink0'));
      else if (e < 0.85) front.pset(px, py, c('rock0'));
      else if (e < 1.15 && y < 0) front.pset(px, py, c('rock1'));
    }
    // sand drifts up against the rocks' feet in soft mounds
    for (let x = 0; x < W; x++) {
      const drift = Math.round(1 + noise.fbm1(x * 0.08 + 31, 2) * 4);
      for (let y = sandTop[x] - drift; y < sandTop[x]; y++) {
        const i = y * W + x;
        if (front.data[i] === CLEAR) continue;
        front.data[i] = y === sandTop[x] - drift ? c('sand4') : bayer(x, y) > 0.5 ? c('sand3') : c('sand2');
      }
    }
    layout.cave = cave;
  }

  function drawBack(s) { s.data.set(back.data); }
  function drawFront(s) { s.blit(front, 0, 0); }

  /** The underside of the surface: a silvery, rippling band with a bright waterline. */
  function drawSurface(s, time) {
    const { W, surfaceY } = layout;
    const t = Math.floor(time * 15) / 15;
    for (let x = 0; x < W; x++) {
      const wave = Math.sin(x * 0.085 + t * 0.9) * 1.4 + Math.sin(x * 0.23 - t * 1.5) * 0.7;
      const line = Math.round(surfaceY + wave);
      for (let y = 0; y <= line; y++) {
        const shimmer = Math.sin(x * 0.19 + y * 0.9 + t * 2.1) + Math.sin(x * 0.07 - t * 1.3 + y * 0.4);
        let color = y < line - 3 ? c('ray0') : c('ray1');
        if (shimmer > 1.25) color = c('foam0');
        if (shimmer > 1.7) color = c('foam1');
        if (y === line) color = shimmer > 0.4 ? c('foam2') : c('foam1');
        if (y === line - 1 && bayer(x, y) > 0.5) color = c('ray2');
        s.pset(x, y, color);
      }
    }
  }

  /** Light shafts from the surface, drifting and breathing; faint near the floor. */
  function drawRays(s, time, strength = 1) {
    const { H, surfaceY, floorY } = layout;
    const d = s.data, W = s.w;
    for (const r of rays) {
      const sway = Math.sin(time * r.speed + r.phase) * 12;
      const pulse = 0.65 + Math.sin(time * r.speed * 3 + r.phase * 2) * 0.35;
      for (let y = surfaceY; y < floorY + 6 && y < H; y++) {
        const depth = (y - surfaceY) / (floorY - surfaceY);
        const cx = r.x + sway + (y - surfaceY) * r.slant;
        const half = r.width * (0.7 + depth * 0.6);
        const fade = (1 - depth * 0.85) * pulse * strength;
        for (let x = Math.max(0, Math.floor(cx - half)); x <= Math.min(W - 1, Math.ceil(cx + half)); x++) {
          const q = 1 - Math.abs(x - cx) / half;
          const level = q * q * fade * 3;
          let k = Math.floor(level);
          if (level - k > bayer(x, y)) k++;
          if (k > 0) { const i = y * W + x; d[i] = LIGHT.ray[Math.min(3, k) - 1][d[i]]; }
        }
      }
    }
  }

  /** Dancing caustic lines on sand and rock tops. */
  function drawCaustics(s, time, strength = 1) {
    const t = Math.floor(time * 12) / 12;
    const d = s.data, W = s.w, mask = lit.data;
    const y0 = Math.floor(layout.floorY - layout.H * 0.4);
    for (let y = Math.max(0, y0); y < s.h; y++) {
      const falloff = strength * (1 - (y - layout.floorY) / (s.h - layout.floorY + 20) * 0.7);
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!mask[i]) continue;
        const a = Math.sin(x * 0.21 + Math.sin(y * 0.31 + t * 0.9) * 1.6 + t * 0.7);
        const b = Math.sin(y * 0.37 - x * 0.09 + Math.sin(x * 0.13 - t * 0.6) * 1.4 - t * 0.8);
        const v = 1 - Math.abs(a + b) * 0.9;
        if (v * falloff > 0.55 + bayer(x, y) * 0.25) d[i] = LIGHT.caustic[v > 0.85 ? 1 : 0][d[i]];
      }
    }
  }

  return {
    build, drawBack, drawFront, drawSurface, drawRays, drawCaustics,
    get rocks() { return rocks; },
    sandAt(x) { return sandTop[clamp(Math.round(x), 0, sandTop.length - 1)]; },
  };
}
